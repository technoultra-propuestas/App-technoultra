"use server";

import { redirect } from "next/navigation";
import { assertRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/** Registra la aceptación de cada versión pendiente (versión exacta, fecha, IP y agente en base de datos). */
export async function acceptPendingLegalAction(fd: FormData): Promise<void> {
  await assertRole(["client"]);
  if (fd.get("accept") !== "on") redirect("/c/legal");
  const supabase = await createClient();
  const { data } = await supabase.rpc("pending_legal_documents");
  for (const d of (data ?? []) as { id: string }[]) await supabase.rpc("accept_legal_document", { p_document: d.id });
  redirect("/c");
}
