"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { clearAssistantCache } from "@/lib/assistant/router";
import { createClient } from "@/lib/supabase/server";

const CATEGORIES = ["servicios", "precios", "cobertura", "pagos", "tickets", "cotizaciones", "documentos", "garantia", "mantenimiento", "tienda", "ayuda", "general"] as const;
const SOURCES = ["service", "coverage", "setting", "status"] as const;
/** Variables que el servidor sabe rellenar (el resto se rechaza para no publicar respuestas a medias). */
const KNOWN_VARS = new Set(["service_name", "price", "includes", "excludes", "cities", "home_fees", "phone", "name", "address", "default_months"]);

const schema = z.object({
  id: z.string().uuid().optional().or(z.literal("")),
  category: z.enum(CATEGORIES, { message: "Elige una categoría." }),
  title: z.string().trim().min(3, "Escribe un título (mínimo 3 caracteres).").max(140),
  question: z.string().trim().min(3, "Escribe la pregunta.").max(300),
  answer: z.string().trim().min(3, "Escribe la respuesta.").max(2000),
  keywords: z.string().max(800).optional().default(""),
  status: z.enum(["draft", "published", "archived"]),
  priority: z.string().regex(/^-?\d{1,3}$/, "La prioridad es un número entre -100 y 100.").transform(Number).pipe(z.number().min(-100).max(100)),
  sourceType: z.union([z.literal(""), z.enum(SOURCES)]).optional().default(""),
  sourceId: z.string().trim().max(120).optional().default(""),
  usesAi: z.string().optional(),
});

/** Crea o actualiza una entrada. El SUPERADMIN (con MFA) es el único autorizado: lo exige este código Y las políticas RLS. */
export async function saveEntryAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const me = await assertRole(["superadmin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const unknown = [...v.answer.matchAll(/\{([a-z_]+)\}/g)].map((m) => m[1]).filter((k) => !KNOWN_VARS.has(k));
  if (unknown.length) return { ok: false, error: `Variables no reconocidas: ${[...new Set(unknown)].map((k) => `{${k}}`).join(", ")}.` };
  if ((v.sourceType === "service" || v.sourceType === "setting" || v.sourceType === "status") && !v.sourceId) return { ok: false, error: "Indica la fuente (slug del servicio, clave del ajuste o estado)." };
  if (/\$\s?\d{1,3}(?:[.,]\d{3})+/.test(v.answer) && v.sourceType !== "") return { ok: false, error: "No escribas importes a mano en una respuesta con fuente: usa {price} para que se actualice solo." };
  const keywords = [...new Set(v.keywords.split(",").map((k) => k.trim().toLowerCase()).filter((k) => k && k.length <= 40))].slice(0, 20);
  const row = {
    category: v.category,
    title: v.title,
    question: v.question,
    answer: v.answer,
    keywords,
    status: v.status,
    priority: v.priority,
    source_type: v.sourceType || null,
    source_id: v.sourceType && v.sourceId ? v.sourceId : null,
    uses_ai: v.usesAi === "on",
  };
  const supabase = await createClient();
  const res = v.id ? await supabase.from("knowledge_entries").update(row).eq("id", v.id).select("id").maybeSingle() : await supabase.from("knowledge_entries").insert({ ...row, created_by: me.id }).select("id").maybeSingle();
  if (res.error || !res.data) {
    console.error("knowledge.save", res.error?.code);
    return { ok: false, error: "No pudimos guardar la entrada. Revisa los datos e inténtalo de nuevo." };
  }
  clearAssistantCache();
  revalidatePath("/b/conocimiento");
  redirect("/b/conocimiento");
}

const statusSchema = z.object({ id: z.string().uuid(), status: z.enum(["draft", "published", "archived"]) });
export async function setEntryStatusAction(fd: FormData): Promise<void> {
  await assertRole(["superadmin"]);
  const p = statusSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const { error } = await (await createClient()).from("knowledge_entries").update({ status: p.data.status }).eq("id", p.data.id);
  if (error) console.error("knowledge.status", error.code);
  clearAssistantCache();
  revalidatePath("/b/conocimiento");
}
