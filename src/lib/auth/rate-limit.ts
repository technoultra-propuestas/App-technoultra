import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
}

/**
 * Limitador por clave en base de datos (ventana fija). Falla CERRADO: si no se puede verificar, se rechaza.
 * El sujeto (correo/IP) se hashea para no persistir datos personales en la tabla.
 */
export async function allow(
  scope: string,
  subject: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const key = `${scope}:${createHash("sha256").update(subject.toLowerCase()).digest("hex").slice(0, 32)}`;
    const { data, error } = await createAdminClient().rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    return !error && data === true;
  } catch {
    return false;
  }
}

export const TOO_MANY = "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.";
