"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getProfile } from "@/lib/auth/session";
import { notificationHref } from "@/lib/notifications";
import { createClient } from "@/lib/supabase/server";

/** Marca como leído y abre el destino. RLS garantiza que solo se pueda tocar un aviso propio. */
export async function openNotificationAction(fd: FormData): Promise<void> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  const id = z.string().uuid().safeParse(fd.get("id"));
  if (!id.success) return;
  const supabase = await createClient();
  const { data: n } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id.data).select("entity_type, entity_id").maybeSingle();
  revalidatePath("/avisos");
  const href = n ? notificationHref(profile.role, n.entity_type, n.entity_id) : null;
  if (href) redirect(href);
}

export async function markAllReadAction(): Promise<void> {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  await (await createClient()).from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
  revalidatePath("/avisos");
}
