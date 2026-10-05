"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { assertRole } from "@/lib/auth/session";
import { zodToState, type ActionState } from "@/lib/auth/schemas";
import { addressSchema, resolveAddressPlace } from "@/lib/domain/address";
import { createClient } from "@/lib/supabase/server";

async function ctx() {
  const profile = await assertRole(["client"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("profile_id", profile.id)
    .is("deleted_at", null)
    .maybeSingle();
  if (!data) throw new Error("customer_not_found");
  return { supabase, customerId: data.id as string };
}

export async function addAddressAction(_p: ActionState, fd: FormData): Promise<ActionState> {
  const parsed = addressSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) return zodToState(parsed.error);
  const v = parsed.data;
  const { supabase, customerId } = await ctx();
  const place = await resolveAddressPlace(supabase, v);
  if (!place.ok) return { ok: false, error: place.error };
  const { count } = await supabase
    .from("addresses")
    .select("id", { count: "exact", head: true })
    .is("deleted_at", null);
  const { error } = await supabase.from("addresses").insert({
    customer_id: customerId,
    label: v.label || "Casa",
    line1: v.line1,
    neighborhood: v.neighborhood || null,
    city_name: place.city_name,
    department: place.department,
    dane_code: place.dane_code,
    is_default: (count ?? 0) === 0,
  });
  if (error) return { ok: false, error: "No pudimos guardar la dirección." };
  revalidatePath("/c/direcciones");
  return { ok: true, message: "Dirección guardada." };
}

const idSchema = z.string().uuid();

export async function setDefaultAddressAction(fd: FormData): Promise<void> {
  const id = idSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  const { supabase } = await ctx();
  // Primero se libera la actual (índice único parcial: una sola predeterminada por cliente).
  await supabase.from("addresses").update({ is_default: false }).eq("is_default", true);
  await supabase.from("addresses").update({ is_default: true }).eq("id", id.data);
  revalidatePath("/c/direcciones");
}

export async function archiveAddressAction(fd: FormData): Promise<void> {
  const id = idSchema.safeParse(fd.get("id"));
  if (!id.success) return;
  const { supabase } = await ctx();
  await supabase
    .from("addresses")
    .update({ deleted_at: new Date().toISOString(), is_default: false })
    .eq("id", id.data);
  revalidatePath("/c/direcciones");
}
