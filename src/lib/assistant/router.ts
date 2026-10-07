import { createHash } from "node:crypto";
import type { createClient } from "@/lib/supabase/server";
import type { LlmOptions, LlmResult } from "@/lib/ai/llm";
import { buildAiPrompt, parseAiReply, type Candidate } from "./ai";
import { money, normalize, sanitizeReply, scoreEntry, tokens } from "./text";
import { ORDER_STATUS_HELP, PAYMENT_STATUS_HELP, TICKET_STATUS_HELP } from "./status";

/**
 * TECHNOULTRA KNOWLEDGE & RESPONSE LAYER — `routeAssistantRequest` es el ÚNICO punto de entrada del asistente.
 *   1) Datos propios (tickets, pagos, pedidos, cotizaciones): consulta con la sesión de la persona (RLS). 0 tokens.
 *   2) Reglas deterministas: precio/alcance de un servicio, cobertura, significado de estados, saludos. 0 tokens.
 *   3) FAQ publicada (con plantillas: precios y cobertura salen de la base de datos, nunca se copian). 0 tokens.
 *   4) IA — solo si nada de lo anterior resuelve la pregunta: contexto mínimo, respuesta corta validada. Sin herramientas ni acciones.
 *   5) Respaldo: si la IA falla, FAQ aproximada o respuesta segura con enlaces. La IA nunca bloquea nada.
 * La IA no decide nada crítico: no aprueba pagos, no cambia precios ni estados, no crea solicitudes (solo orienta y sugiere servicios
 * existentes; la persona confirma en el formulario).
 */
export type Db = Awaited<ReturnType<typeof createClient>>;
export type AssistantRoute = "deterministic" | "database" | "faq" | "ai" | "fallback";
export type Suggestion = { slug: string; name: string; priceLabel: string };
export type AssistantReply = { text: string; route: AssistantRoute; topic?: string; suggestions?: Suggestion[]; links?: { label: string; href: string }[] };
export type UsageRecord = { route: AssistantRoute; topic?: string; provider?: string; model?: string; tokensInput?: number | null; tokensOutput?: number | null; latencyMs?: number; error?: string };
export type AssistantDeps = {
  db: Db;
  ai: (system: string, user: string, opts?: LlmOptions) => Promise<LlmResult>;
  /** Límite de uso de IA por persona (control de costo). */
  allowAi: () => Promise<boolean>;
  record: (u: UsageRecord) => Promise<void>;
  now?: () => number;
};

export const MAX_MESSAGE = 500;
const FALLBACK: AssistantReply = {
  text: "No pude interpretar completamente tu consulta. Puedes revisar nuestros servicios o solicitar un diagnóstico para que nuestro equipo te ayude.",
  route: "fallback",
  links: [
    { label: "Ver servicios", href: "/c/solicitar" },
    { label: "Solicitar diagnóstico", href: "/c/solicitar/diagnostico-basico" },
  ],
};

type Service = { id: string; slug: string; name: string; short_description: string | null; includes_text: string | null; excludes_text: string | null; base_price: number | null; price_mode: string; price_type_label: string | null; kind: string; is_diagnostic_fee: boolean; requires_quote: boolean; requires_diagnosis: boolean };
type Coverage = { city_name: string; home_fee: number; pickup_fee: number };
type Entry = { id: string; category: string; title: string; question: string; answer: string; keywords: string[]; priority: number; source_type: string | null; source_id: string | null; uses_ai: boolean };

// ---------------------------------------------------------------- caché (solo respuestas públicas y no personales; clave = hash del mensaje normalizado)
const cache = new Map<string, { at: number; reply: AssistantReply }>();
const TTL = { deterministic: 5 * 60_000, faq: 5 * 60_000, ai: 10 * 60_000 } as const;
export const clearAssistantCache = () => cache.clear();
const keyOf = (m: string) => createHash("sha256").update(normalize(m)).digest("hex").slice(0, 32);

// ---------------------------------------------------------------- datos de apoyo (todo bajo RLS: catálogo y FAQ publicada son de lectura general)
async function loadCatalog(db: Db): Promise<Service[]> {
  const { data } = await db
    .from("services")
    .select("id, slug, name, short_description, includes_text, excludes_text, base_price, price_mode, price_type_label, kind, is_diagnostic_fee, requires_quote, requires_diagnosis")
    .eq("is_active", true)
    .is("deleted_at", null)
    .order("sort_order")
    .limit(400);
  return (data ?? []) as unknown as Service[];
}
async function loadCoverage(db: Db): Promise<Coverage[]> {
  const { data } = await db.from("coverage_areas").select("city_name, home_fee, pickup_fee").eq("is_active", true);
  return (data ?? []) as unknown as Coverage[];
}
async function loadEntries(db: Db): Promise<Entry[]> {
  const { data } = await db
    .from("knowledge_entries")
    .select("id, category, title, question, answer, keywords, priority, source_type, source_id, uses_ai")
    .eq("status", "published")
    .eq("locale", "es-CO")
    .order("priority", { ascending: false })
    .limit(300);
  return (data ?? []) as unknown as Entry[];
}

export function priceLabel(s: Pick<Service, "base_price" | "price_mode">): string {
  if (!s.base_price || s.base_price <= 0) return "Precio según cotización";
  return s.price_mode === "from" ? `Desde ${money(Number(s.base_price))}` : money(Number(s.base_price));
}

// ---------------------------------------------------------------- coincidencia de servicios (determinista)
export function findServices(message: string, catalog: Service[], limit = 3): { s: Service; score: number }[] {
  const mt = new Set(tokens(message));
  const out: { s: Service; score: number }[] = [];
  for (const s of catalog) {
    const nt = tokens(s.name);
    if (!nt.length) continue;
    const hit = nt.filter((t) => mt.has(t)).length;
    if (!hit) continue;
    const score = hit / nt.length + (hit === nt.length ? 0.5 : 0);
    if (score >= 0.6) out.push({ s, score });
  }
  return out.sort((a, b) => b.score - a.score || a.s.name.length - b.s.name.length).slice(0, limit);
}

const has = (m: string, words: string[]) => words.some((w) => new RegExp(`\\b${w}\\b`).test(m));
const PERSONAL = ["mi", "mis", "mio", "mia", "mios", "mias"];
const GREETING = /^(hola|buenas|buenos dias|buenas tardes|buenas noches|hey|gracias|muchas gracias|ok|listo|vale|perfecto|chao|adios)( [a-z]+)?$/;

// ---------------------------------------------------------------- plantillas de la base de conocimiento
async function renderEntry(e: Entry, ctx: { db: Db; catalog: Service[]; coverage: Coverage[] }): Promise<string | null> {
  const vars: Record<string, string> = {};
  if (e.source_type === "service") {
    const s = ctx.catalog.find((x) => x.slug === e.source_id);
    if (!s) return null;
    vars.service_name = s.name;
    vars.price = priceLabel(s);
    vars.includes = s.includes_text ? `Incluye: ${s.includes_text.replace(/\s+/g, " ").trim()}.` : "";
    vars.excludes = s.excludes_text ? `No incluye: ${s.excludes_text.replace(/\s+/g, " ").trim()}.` : "";
  } else if (e.source_type === "coverage") {
    if (!ctx.coverage.length) return null;
    vars.cities = ctx.coverage.map((c) => c.city_name).join(", ");
    vars.home_fees = ctx.coverage.map((c) => `${c.city_name} ${money(Number(c.home_fee))}`).join(", ");
  } else if (e.source_type === "setting" && e.source_id) {
    const { data } = await ctx.db.from("app_settings").select("value").eq("key", e.source_id).maybeSingle();
    const raw = (data as { value?: unknown } | null)?.value;
    if (raw !== undefined && raw !== null) vars[e.source_id.split(".").pop() as string] = String(raw);
  }
  const text = e.answer.replace(/\{([a-z_]+)\}/g, (_m, k: string) => vars[k] ?? `{${k}}`).replace(/\s+/g, " ").trim();
  return /\{[a-z_]+\}/.test(text) ? null : text;
}

// ---------------------------------------------------------------- 1) datos propios
async function ownData(m: string, db: Db): Promise<AssistantReply | null> {
  const personal = has(m, PERSONAL) || has(m, ["estado", "donde", "cuando"]);
  if (!personal) return null;
  if (has(m, ["pago", "pagos", "pague", "pagado", "cobro"])) {
    const { data } = await db.from("payments").select("code, status, amount, purpose, created_at").order("created_at", { ascending: false }).limit(3);
    const rows = (data ?? []) as unknown as { code: string; status: string; amount: number }[];
    if (!rows.length) return { text: "Todavía no tienes pagos registrados.", route: "database", topic: "payment" };
    const lines = rows.map((p) => `${p.code} por ${money(Number(p.amount))} ${PAYMENT_STATUS_HELP[p.status] ?? p.status}`);
    return { text: `Tus pagos más recientes: ${lines.join("; ")}.`, route: "database", topic: "payment" };
  }
  if (has(m, ["pedido", "pedidos", "compra", "compras"])) {
    const { data } = await db.from("orders").select("id, code, status, total").order("created_at", { ascending: false }).limit(3);
    const rows = (data ?? []) as unknown as { id: string; code: string; status: string; total: number }[];
    if (!rows.length) return { text: "Todavía no tienes pedidos en la tienda.", route: "database", topic: "order", links: [{ label: "Ir a la tienda", href: "/c/tienda" }] };
    return { text: `Tus pedidos más recientes: ${rows.map((o) => `${o.code} (${ORDER_STATUS_HELP[o.status] ?? o.status}, ${money(Number(o.total))})`).join("; ")}.`, route: "database", topic: "order", links: rows.slice(0, 1).map((o) => ({ label: `Ver ${o.code}`, href: `/c/pedidos/${o.id}` })) };
  }
  if (has(m, ["cotizacion", "cotizaciones", "presupuesto"])) {
    const { data } = await db.from("quotes").select("id, code, status, total, ticket_id").neq("status", "draft").order("created_at", { ascending: false }).limit(3);
    const rows = (data ?? []) as unknown as { id: string; code: string; status: string; total: number; ticket_id: string }[];
    if (!rows.length) return { text: "Todavía no tienes cotizaciones.", route: "database", topic: "quote" };
    const label: Record<string, string> = { sent: "esperando tu decisión", clarification: "con una pregunta tuya en revisión", approved: "aprobada", rejected: "rechazada", expired: "vencida", superseded: "reemplazada por una nueva versión" };
    return { text: `Tus cotizaciones más recientes: ${rows.map((q) => `${q.code} por ${money(Number(q.total))}, ${label[q.status] ?? q.status}`).join("; ")}.`, route: "database", topic: "quote", links: rows.slice(0, 1).map((q) => ({ label: `Ver ${q.code}`, href: `/c/tickets/${q.ticket_id}` })) };
  }
  // «servicio/equipo» solos son demasiado genéricos («qué servicio necesito para mi laptop»): solo cuentan junto a «estado» o «en curso».
  if (has(m, ["ticket", "tickets", "solicitud", "solicitudes", "reparacion"]) || (has(m, ["servicio", "servicios", "equipo"]) && (has(m, ["estado", "avance"]) || m.includes("en curso")))) {
    const { data } = await db.from("tickets").select("id, code, status, services(name)").not("status", "in", "(delivered,cancelled)").order("received_at", { ascending: false }).limit(3);
    const rows = (data ?? []) as unknown as { id: string; code: string; status: string; services: { name: string } | { name: string }[] | null }[];
    if (!rows.length) return { text: "No tienes servicios en curso ahora mismo.", route: "database", topic: "ticket", links: [{ label: "Solicitar un servicio", href: "/c/solicitar" }] };
    const lines = rows.map((t) => {
      const s = Array.isArray(t.services) ? t.services[0] : t.services;
      const st = TICKET_STATUS_HELP[t.status];
      return `${t.code}${s ? ` (${s.name})` : ""}: ${st?.label ?? t.status}. ${st?.meaning ?? ""}`;
    });
    return { text: lines.join(" "), route: "database", topic: "ticket", links: rows.slice(0, 2).map((t) => ({ label: `Ver ${t.code}`, href: `/c/tickets/${t.id}` })) };
  }
  return null;
}

// ---------------------------------------------------------------- 2) reglas deterministas
async function rules(raw: string, m: string, ctx: { db: Db; catalog: Service[]; coverage: Coverage[] }): Promise<AssistantReply | null> {
  if (GREETING.test(m)) return { text: "¡Hola! Soy el asistente de TechnoUltra. Cuéntame qué necesitas: puedo orientarte sobre servicios, precios, cobertura o el estado de tu solicitud.", route: "deterministic", topic: "greeting" };
  // Significado de un estado del ticket
  if (has(m, ["significa", "quiere decir", "que es"])) {
    for (const [, st] of Object.entries(TICKET_STATUS_HELP)) {
      if (m.includes(normalize(st.label))) return { text: `«${st.label}»: ${st.meaning}`, route: "deterministic", topic: "status" };
    }
  }
  // Cobertura de una ciudad
  const city = ctx.coverage.find((c) => m.includes(normalize(c.city_name)));
  if (city && has(m, ["atienden", "cobertura", "domicilio", "llegan", "visitan", "recogen", "recogida", "servicio", "puedo"])) {
    const wantsHome = has(m, ["domicilio", "casa", "llegan", "visitan"]);
    return { text: `Sí, tenemos servicio presencial en ${city.city_name}. ${wantsHome ? `El domicilio tiene una tarifa de ${money(Number(city.home_fee))}, que se confirma al solicitar el servicio.` : `Puedes llevar tu equipo al local o pedir domicilio (${money(Number(city.home_fee))}) o recogida (${money(Number(city.pickup_fee))}).`}`, route: "deterministic", topic: "coverage" };
  }
  // Precio / alcance de un servicio concreto
  const priceQ = has(m, ["cuesta", "cuanto", "cuestan", "precio", "precios", "valor", "costo", "tarifa", "vale", "cobran"]);
  const includeQ = has(m, ["incluye", "incluido", "incluyen", "alcance", "trae"]);
  if (priceQ || includeQ) {
    const found = findServices(raw, ctx.catalog, 2);
    if (found.length && found[0].score >= 1) {
      const s = found[0].s;
      const ambiguous = found.length > 1 && found[1].score >= found[0].score;
      if (!ambiguous) {
        const parts: string[] = [];
        if (priceQ || !includeQ) parts.push(`El ${s.name} tiene un valor de ${priceLabel(s).replace(/^Precio según cotización$/, "precio según cotización")}.`);
        if (s.price_mode === "from" || s.requires_quote || s.requires_diagnosis) parts.push("El precio final se confirma después de revisar tu caso; no pagas nada antes de aprobar la cotización.");
        if (includeQ && s.includes_text) parts.push(`Incluye: ${s.includes_text.replace(/\s+/g, " ").trim()}.`);
        if (includeQ && s.excludes_text) parts.push(`No incluye: ${s.excludes_text.replace(/\s+/g, " ").trim()}.`);
        return { text: parts.join(" "), route: "deterministic", topic: "service", suggestions: [{ slug: s.slug, name: s.name, priceLabel: priceLabel(s) }] };
      }
    }
  }
  return null;
}

// ---------------------------------------------------------------- 3) FAQ
async function faq(raw: string, entries: Entry[], ctx: { db: Db; catalog: Service[]; coverage: Coverage[] }, threshold: number, onlyAnswerable: boolean): Promise<{ reply: AssistantReply; score: number } | null> {
  const ranked = entries
    .filter((e) => !onlyAnswerable || !e.uses_ai)
    .map((e) => ({ e, score: scoreEntry(raw, e) + e.priority / 100 }))
    .filter((x) => x.score >= threshold)
    .sort((a, b) => b.score - a.score);
  for (const { e, score } of ranked.slice(0, 3)) {
    const text = await renderEntry(e, ctx);
    if (text) return { reply: { text, route: "faq", topic: e.category }, score };
  }
  return null;
}

// ---------------------------------------------------------------- orquestador
export async function routeAssistantRequest(input: { message: string }, deps: AssistantDeps): Promise<AssistantReply> {
  const now = deps.now ?? Date.now;
  const t0 = now();
  const raw = input.message.replace(/\s+/g, " ").trim().slice(0, MAX_MESSAGE);
  const finish = async (reply: AssistantReply, extra: Partial<UsageRecord> = {}) => {
    await deps.record({ route: reply.route, topic: reply.topic, latencyMs: now() - t0, ...extra }).catch(() => {});
    return reply;
  };
  if (raw.length < 2) return finish({ text: "Escribe tu consulta y te ayudo.", route: "deterministic", topic: "empty" });
  const m = normalize(raw);

  const cached = cache.get(keyOf(raw));
  if (cached && now() - cached.at < TTL[cached.reply.route === "ai" ? "ai" : cached.reply.route === "faq" ? "faq" : "deterministic"]) {
    return finish({ ...cached.reply }, { topic: cached.reply.topic ? `${cached.reply.topic}:cache` : "cache" });
  }
  const remember = (reply: AssistantReply) => {
    if (reply.route === "deterministic" || reply.route === "faq" || reply.route === "ai") cache.set(keyOf(raw), { at: now(), reply });
    if (cache.size > 500) cache.delete(cache.keys().next().value as string);
    return reply;
  };

  // 1) datos propios (no se cachea: es personal)
  const own = await ownData(m, deps.db);
  if (own) return finish(own);

  const [catalog, coverage, entries] = await Promise.all([loadCatalog(deps.db), loadCoverage(deps.db), loadEntries(deps.db)]);
  const ctx = { db: deps.db, catalog, coverage };

  // 2) reglas · 3) FAQ
  const ruled = await rules(raw, m, ctx);
  if (ruled) return finish(remember(ruled));
  const hit = await faq(raw, entries, ctx, 3.2, true);
  if (hit) return finish(remember(hit.reply));

  // 4) IA (solo si hace falta y hay presupuesto de uso)
  if (tokens(raw).length >= 2 && (await deps.allowAi())) {
    const candidates = pickCandidates(raw, catalog);
    const retrieved: { title: string; answer: string }[] = [];
    for (const { e } of entries.map((e) => ({ e, s: scoreEntry(raw, e) })).filter((x) => x.s >= 1.5).sort((a, b) => b.s - a.s).slice(0, 3)) {
      const text = await renderEntry(e, ctx);
      if (text) retrieved.push({ title: e.title, answer: text });
    }
    const { system, user } = buildAiPrompt({ message: raw, candidates, retrieved });
    const t1 = now();
    const res = await deps.ai(system, user, { maxTokens: 450, timeoutMs: 15_000 }).catch(() => ({ ok: false as const, reason: "provider_error" as const }));
    if (res.ok) {
      const parsed = parseAiReply(res.text, candidates);
      if (parsed) {
        const bySlug = new Map(catalog.map((s) => [s.id, s]));
        const suggestions = parsed.serviceIds.map((id) => bySlug.get(id)).filter((s): s is Service => Boolean(s)).map((s) => ({ slug: s.slug, name: s.name, priceLabel: priceLabel(s) }));
        const reply: AssistantReply = { text: sanitizeReply(parsed.reply), route: "ai", topic: "orientation", suggestions: suggestions.length ? suggestions : undefined };
        return finish(remember(reply), { provider: res.provider, model: res.model, tokensInput: res.usage.input, tokensOutput: res.usage.output, latencyMs: now() - t1 });
      }
      await deps.record({ route: "ai", provider: res.provider, model: res.model, tokensInput: res.usage.input, tokensOutput: res.usage.output, latencyMs: now() - t1, error: "invalid_response" }).catch(() => {});
    } else {
      await deps.record({ route: "ai", latencyMs: now() - t1, error: res.reason }).catch(() => {});
    }
  }

  // 5) respaldo: FAQ aproximada (incluye entradas que usan IA como contexto) o respuesta segura
  const near = await faq(raw, entries, ctx, 1.5, false);
  if (near) return finish({ ...near.reply, route: "fallback" });
  return finish({ ...FALLBACK });
}

/** Candidatos mínimos para la IA: coincidencias del catálogo; si no hay, los servicios de diagnóstico (punto de partida seguro). */
export function pickCandidates(message: string, catalog: Service[]): Candidate[] {
  const mt = new Set(tokens(message));
  const scored = catalog
    .map((s) => {
      const t = new Set([...tokens(s.name), ...tokens(s.short_description ?? "")]);
      let hit = 0;
      for (const w of mt) if (t.has(w)) hit++;
      return { s, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.hit - a.hit)
    .slice(0, 8)
    .map((x) => x.s);
  const base = scored.length ? scored : catalog.filter((s) => s.is_diagnostic_fee).slice(0, 4);
  return base.map((s) => ({ id: s.id, name: s.name, price: priceLabel(s), summary: (s.short_description ?? "").slice(0, 120) }));
}
