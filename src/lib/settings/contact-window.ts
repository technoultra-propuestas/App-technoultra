import "server-only";
import { contactWindowText } from "@/lib/domain/pricing";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Plazo de primer contacto tras un pago confirmado (`service.contact_window_hours`, definido por la administración).
 * El ajuste es PRIVADO (no se expone por RLS al público): se lee en el servidor, solo esa clave y solo lectura.
 * Devuelve null si no está definido o es 0: entonces la aplicación no promete ningún plazo.
 */
export async function getContactWindowText(): Promise<string | null> {
  try {
    const { data } = await createAdminClient().from("app_settings").select("value").eq("key", "service.contact_window_hours").maybeSingle();
    return contactWindowText(Number(data?.value));
  } catch {
    return null;
  }
}
