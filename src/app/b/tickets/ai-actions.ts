"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

const schema = z.object({
  ticketId: z.string().uuid(),
  id: z.string().uuid(),
  status: z.enum(["validated", "edited", "rejected"]),
});

/** La función de base de datos verifica que el solicitante pueda gestionar el ticket y registra quién validó y cuándo. */
export async function reviewAiAction(fd: FormData): Promise<void> {
  await assertRole(["technician", "admin"]);
  const p = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!p.success) return;
  const supabase = await createClient();
  await supabase.rpc("review_ai_diagnostic", { p_id: p.data.id, p_status: p.data.status });
  revalidatePath(`/b/tickets/${p.data.ticketId}`);
}
