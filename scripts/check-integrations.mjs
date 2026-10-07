// Valida las credenciales de las integraciones con llamadas reales de SOLO LECTURA (o de prueba sin efecto) y sin imprimir secretos.
//   node scripts/check-integrations.mjs            → usa .env.local
//   node --env-file=.env.prod scripts/check-integrations.mjs   → otro archivo
// Mercado Pago: cuenta, tipo de credencial (prueba/producción), creación de una preferencia de $1.000 (no cobra nada) y webhook.
import { existsSync, readFileSync } from "node:fs";

const env = { ...process.env };
if (existsSync(".env.local") && !process.env.__NO_LOCAL) {
  for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#") && env[l.slice(0, i).trim()] === undefined) env[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
}
const ok = (n, d = "") => console.log(`OK    ${n}${d ? " — " + d : ""}`);
const bad = (n, d = "") => (console.log(`FALLA ${n}${d ? " — " + d : ""}`), (process.exitCode = 1));
const warn = (n, d = "") => console.log(`AVISO ${n}${d ? " — " + d : ""}`);
const json = async (r) => r.json().catch(() => ({}));
const t = (ms = 15000) => AbortSignal.timeout(ms);

// ---------------------------------------------------------------- Mercado Pago
const mp = env.MERCADOPAGO_ACCESS_TOKEN;
if (!mp) bad("Mercado Pago: MERCADOPAGO_ACCESS_TOKEN", "vacío");
else {
  const h = { Authorization: `Bearer ${mp}` };
  const me = await fetch("https://api.mercadopago.com/users/me", { headers: h, signal: t() }).then(async (r) => ({ s: r.status, j: await json(r) })).catch((e) => ({ s: 0, j: { message: e.name } }));
  if (me.s !== 200) bad("Mercado Pago: token", `HTTP ${me.s} ${me.j.message ?? ""}`);
  else ok("Mercado Pago: token válido", `país ${me.j.site_id}${/^TEST-/.test(mp) ? " · credencial de PRUEBA (TEST-)" : /^APP_USR-/.test(mp) ? " · APP_USR (cuenta de prueba o producción: se distingue en el panel)" : ""}`);
  // Orders API: se crea una Order de 1.000 COP SIN pagar y se cancela de inmediato (no cobra nada).
  const key = () => crypto.randomUUID();
  const ord = await fetch("https://api.mercadopago.com/v1/orders", {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json", "X-Idempotency-Key": key() },
    body: JSON.stringify({ type: "online", processing_mode: "manual", total_amount: "1000", external_reference: `check-${Date.now()}`, expiration_time: "PT1H", items: [{ title: "Validación de credenciales", unit_price: "1000", quantity: 1 }] }),
    signal: t(),
  }).then(async (r) => ({ s: r.status, j: await json(r) })).catch(() => ({ s: 0, j: {} }));
  if (ord.s === 201 && ord.j.id) {
    ok("Mercado Pago: Orders API crea una Order de Checkout Pro", ord.j.checkout_url ? "con checkout_url" : "");
    const c = await fetch(`https://api.mercadopago.com/v1/orders/${ord.j.id}/cancel`, { method: "POST", headers: { ...h, "X-Idempotency-Key": key() }, signal: t() }).then((r) => r.status).catch(() => 0);
    c === 200 ? ok("Mercado Pago: la Order de validación se canceló (sin cobro)") : warn("Mercado Pago: cancelar la Order de validación", `HTTP ${c}`);
  } else bad("Mercado Pago: crear Order", `HTTP ${ord.s} ${ord.j.errors?.[0]?.code ?? ord.j.message ?? ""}`);
  if (!env.NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY) warn("Mercado Pago: NEXT_PUBLIC_MERCADOPAGO_PUBLIC_KEY", "vacía (solo se necesita si se usan Bricks)");
  if (!env.MERCADOPAGO_WEBHOOK_SECRET) warn("Mercado Pago: MERCADOPAGO_WEBHOOK_SECRET", "vacío: sin él NO se confirma ningún pago (el webhook rechaza lo que no pueda verificar). Mercado Pago → Tus integraciones → Webhooks → «Clave secreta».");
  else ok("Mercado Pago: secreto del webhook definido");
  const hook = await fetch(`${env.NEXT_PUBLIC_APP_URL ?? "https://app.technoultra.com"}/api/webhooks/mercadopago?data.id=1&type=payment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}", signal: t() }).then((r) => r.status).catch(() => 0);
  if (hook >= 400 && hook < 600) ok("Webhook de pagos: rechaza peticiones sin firma válida", `HTTP ${hook}${hook === 503 ? " (sin secreto configurado el webhook se niega a aceptar nada)" : ""}`);
  else warn("Webhook de pagos", `respuesta inesperada a una petición sin firma: ${hook}`);
}

// ---------------------------------------------------------------- IA (OpenRouter / Gemini)
if (env.AI_PROVIDER === "openrouter") {
  if (!env.OPENROUTER_API_KEY) bad("IA: OPENROUTER_API_KEY", "vacía");
  else {
    const r = await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${env.OPENROUTER_API_KEY}` },
      body: JSON.stringify({ model: env.AI_MODEL, messages: [{ role: "user", content: 'Responde solo JSON: {"ok":true}' }], response_format: { type: "json_object" }, max_tokens: 40 }),
      signal: t(30000),
    }).then(async (x) => ({ s: x.status, j: await json(x) })).catch(() => ({ s: 0, j: {} }));
    if (r.s === 200) ok("IA: OpenRouter responde", `modelo solicitado «${env.AI_MODEL}» → atendido por «${r.j.model ?? "?"}»`);
    else bad("IA: OpenRouter", `HTTP ${r.s} ${r.j.error?.message ?? ""}`);
    if (/free/.test(env.AI_MODEL ?? "")) warn("IA: modelo gratuito", "su calidad y disponibilidad varían; para diagnósticos de clientes conviene un modelo fijo de pago");
  }
} else if (env.GEMINI_API_KEY) {
  const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL ?? "")}:generateContent`, { method: "POST", headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY }, body: JSON.stringify({ contents: [{ parts: [{ text: "ok" }] }] }), signal: t() }).then((x) => x.status).catch(() => 0);
  r === 200 ? ok("IA: Gemini responde") : bad("IA: Gemini", `HTTP ${r}`);
} else bad("IA", "sin proveedor configurado (AI_PROVIDER=openrouter + OPENROUTER_API_KEY, o GEMINI_*)");

// ---------------------------------------------------------------- Cloudinary
if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) bad("Cloudinary", "faltan variables");
else {
  const auth = Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString("base64");
  const r = await fetch(`https://api.cloudinary.com/v1_1/${env.CLOUDINARY_CLOUD_NAME}/ping`, { headers: { Authorization: `Basic ${auth}` }, signal: t() }).then((x) => x.status).catch(() => 0);
  r === 200 ? ok("Cloudinary: credenciales válidas") : bad("Cloudinary", `HTTP ${r}`);
}

// ---------------------------------------------------------------- Sentry
if (!env.EXCELENTER_CATALOG_CSV_URL) warn("Catálogo Excelenter: EXCELENTER_CATALOG_CSV_URL", "vacío: no hay sincronización automática (solo importación manual de CSV).");
else /^https:\/\//.test(env.EXCELENTER_CATALOG_CSV_URL) ? ok("Catálogo Excelenter: fuente https configurada") : bad("Catálogo Excelenter: EXCELENTER_CATALOG_CSV_URL", "debe ser https");
if (!env.SENTRY_DSN) warn("Sentry: SENTRY_DSN", "vacío: los errores solo quedan en el registro del servidor (Vercel). Proyecto de Sentry → Settings → Client Keys (DSN).");
else /^https:\/\/[^@]+@[^/]+\/\d+$/.test(env.SENTRY_DSN) ? ok("Sentry: DSN con formato válido") : bad("Sentry: SENTRY_DSN", "formato no válido");

process.exit(process.exitCode ?? 0);
