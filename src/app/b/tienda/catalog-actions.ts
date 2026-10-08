"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { redirect } from "next/navigation";
import { assertRole } from "@/lib/auth/session";
import { excelenterCsvUrlProvider, csvTextProvider } from "@/lib/catalog/provider";
import { runCatalogSync, type RpcClient, type SyncOutcome } from "@/lib/catalog/sync";
import { createAdminClient } from "@/lib/supabase/admin";

const MAX_CSV_BYTES = 5 * 1024 * 1024;
const back = (o: SyncOutcome) => {
  revalidatePath("/b/tienda");
  revalidatePath("/b/tienda/sincronizacion");
  revalidatePath("/tienda");
  revalidateTag("catalog", { expire: 0 });
  redirect(`/b/tienda/sincronizacion?r=${o.ok ? o.status : `error-${encodeURIComponent(o.reason)}`}`);
};

/** «Sincronizar ahora»: solo SUPERADMIN (con MFA, validado en servidor). Usa la fuente configurada; si falla, el catálogo queda como estaba. */
export async function syncCatalogNowAction(): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  back(await runCatalogSync(createAdminClient() as unknown as RpcClient, excelenterCsvUrlProvider(), "manual", actor.id));
}

/** Carga manual de un CSV del catálogo (mismo motor y mismas reglas que la sincronización automática). */
export async function importCatalogCsvAction(fd: FormData): Promise<void> {
  const actor = await assertRole(["superadmin"]);
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return redirect("/b/tienda/sincronizacion?r=error-archivo");
  if (file.size > MAX_CSV_BYTES) return redirect("/b/tienda/sincronizacion?r=error-tamano");
  const text = await file.text();
  back(await runCatalogSync(createAdminClient() as unknown as RpcClient, csvTextProvider(text), "manual", actor.id));
}
