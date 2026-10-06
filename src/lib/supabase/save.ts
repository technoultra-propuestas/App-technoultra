import "server-only";
import type { createClient } from "@/lib/supabase/server";

type Sb = Awaited<ReturnType<typeof createClient>>;

/**
 * "Actualizar o insertar" SIN `.upsert()`.
 *
 * supabase-js traduce `.upsert()` a `INSERT … ON CONFLICT (…) DO UPDATE SET <todas las columnas enviadas> = excluded.<…>`, y eso exige
 * permiso de UPDATE sobre las columnas de la clave (p. ej. `key`, `profile_id`, `diagnostic_id`). Esas columnas son inmutables a
 * propósito (no se concede UPDATE sobre ellas), así que el upsert siempre falla con 42501 aunque RLS permita la fila.
 * Esta función actualiza solo `values` y, si la fila no existe, la inserta. Devuelve el error de PostgREST (o null).
 */
export async function updateOrInsert(sb: Sb, table: string, match: Record<string, string>, values: Record<string, unknown>) {
  const keys = Object.keys(match);
  const update = async () => {
    let q = sb.from(table).update(values);
    for (const k of keys) q = q.eq(k, match[k]);
    return q.select(keys[0]);
  };
  const first = await update();
  if (first.error) return first.error;
  if (first.data?.length) return null;
  const ins = await sb.from(table).insert({ ...match, ...values });
  if (ins.error?.code === "23505") return (await update()).error; // otra petición creó la fila entre medias
  return ins.error;
}
