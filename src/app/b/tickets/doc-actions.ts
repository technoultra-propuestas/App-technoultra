"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { allow, TOO_MANY } from "@/lib/auth/rate-limit";
import type { ActionState } from "@/lib/auth/schemas";
import { generateTicketDocument } from "@/lib/documents/generate";
import { scheduleEmailFlush } from "@/lib/email/outbox";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  ticketId: z.string().uuid(),
  kind: z.enum(["reception", "diagnosis", "quote", "delivery", "warranty_product", "warranty_labor"]),
});

/** Solo personal que gestiona ESTE ticket (RLS: asignado o administrador). Cada llamada crea una versión nueva. */
export async function generateDocumentAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const profile = await assertRole(["technician", "admin"]);
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return { ok: false, error: "Datos no válidos." };
  const supabase = await createClient();
  const { data: t } = await supabase.from("tickets").select("id, assigned_to").eq("id", parsed.data.ticketId).is("deleted_at", null).maybeSingle();
  if (!t || (profile.role === "technician" && t.assigned_to !== profile.id)) return { ok: false, error: "No puedes generar documentos de este ticket." };
  if (!(await allow("doc-gen", profile.id, 40, 3600))) return { ok: false, error: TOO_MANY };
  const r = await generateTicketDocument(parsed.data.kind, parsed.data.ticketId, profile.id);
  if (!r.ok) return { ok: false, error: r.error };
  revalidatePath(`/b/tickets/${parsed.data.ticketId}`);
  scheduleEmailFlush();
  return { ok: true, message: `Documento ${r.code} generado.` };
}
