import type { Metadata } from "next";
import { Panel } from "@/components/ui/detail";
import { fmtDateTime } from "@/components/ui/layout";
import { SegmentTabs, TextLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { importCatalogCsvAction, syncCatalogNowAction } from "../catalog-actions";

export const metadata: Metadata = { title: "Catálogo · Sincronización", robots: { index: false } };

const TABS = [
  { key: "pedidos", label: "Pedidos", href: "/b/pedidos" },
  { key: "productos", label: "Productos", href: "/b/tienda" },
  { key: "shop", label: "Shop", href: "/b/tienda/shop" },
  { key: "sync", label: "Sincronización", href: "/b/tienda/sincronizacion" },
];
const RESULT: Record<string, { ok: boolean; text: string }> = {
  success: { ok: true, text: "Sincronización exitosa." },
  partial: { ok: true, text: "Sincronización completada con algunos productos omitidos (ver errores)." },
  "error-not_configured": { ok: false, text: "La fuente automática aún no está configurada (EXCELENTER_CATALOG_CSV_URL). Puedes cargar un CSV manualmente." },
  "error-unavailable": { ok: false, text: "No fue posible actualizar el catálogo. Se conserva la última información válida." },
  "error-invalid": { ok: false, text: "La fuente respondió con un formato no válido. No se cambió nada." },
  "error-empty_source": { ok: false, text: "La fuente llegó vacía. No se cambió nada." },
  "error-suspicious_drop": { ok: false, text: "La fuente trae menos de la mitad de los productos actuales: se rechazó por seguridad. No se cambió nada." },
  "error-archivo": { ok: false, text: "Selecciona un archivo CSV." },
  "error-tamano": { ok: false, text: "El archivo supera los 5 MB." },
};
const STATUS = { success: ["Exitoso", "bg-ok-soft text-ok"], partial: ["Parcial", "bg-warn-soft text-warn"], error: ["Error", "bg-danger-soft text-danger"], running: ["En curso", "bg-info-soft text-info"] } as const;

const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000).toISOString();

export default async function CatalogSyncPage({ searchParams }: { searchParams: Promise<{ r?: string }> }) {
  await requireRole(["superadmin"]);
  const r = RESULT[(await searchParams).r ?? ""];
  const supabase = await createClient();
  const [{ data: runs }, { data: inquiries }] = await Promise.all([
    supabase.from("catalog_sync_runs").select("*").order("started_at", { ascending: false }).limit(20),
    supabase.from("product_inquiries").select("product_id, products(name)").gte("created_at", daysAgo(30)).limit(2000),
  ]);
  const last = (runs ?? [])[0];
  const top = new Map<string, { name: string; n: number }>();
  for (const i of inquiries ?? []) {
    const name = (i.products as unknown as { name: string } | null)?.name ?? "—";
    top.set(i.product_id, { name, n: (top.get(i.product_id)?.n ?? 0) + 1 });
  }
  const topList = [...top.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Catálogo · Sincronización</h1>
      <SegmentTabs label="Secciones de la tienda" items={TABS} active="sync" />
      {r ? (
        <p role="status" className={`m-0 rounded-[14px] px-4 py-3 text-[14px] font-bold ${r.ok ? "bg-ok-soft text-ok" : "bg-danger-soft text-danger"}`}>{r.text}</p>
      ) : null}
      {last?.status === "error" ? (
        <p role="alert" className="m-0 rounded-[14px] bg-danger-soft px-4 py-3 text-[14px] font-bold text-danger">
          La última sincronización falló ({fmtDateTime(last.started_at)}). La tienda sigue mostrando la última información disponible.
        </p>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Panel title="Última sincronización" hint="Fuente: Excelenter (hoja publicada). Cada corrida es idempotente y auditable.">
          {last ? (
            <dl className="m-0 grid grid-cols-2 gap-x-4 gap-y-2 text-[14px]">
              <dt className="text-muted">Fecha</dt><dd className="m-0 font-extrabold">{fmtDateTime(last.started_at)}</dd>
              <dt className="text-muted">Estado</dt><dd className="m-0 font-extrabold">{STATUS[last.status as keyof typeof STATUS]?.[0] ?? last.status}</dd>
              <dt className="text-muted">Productos vistos</dt><dd className="m-0 font-extrabold">{last.products_seen}</dd>
              <dt className="text-muted">Nuevos / actualizados</dt><dd className="m-0 font-extrabold">{last.products_created} / {last.products_updated}</dd>
              <dt className="text-muted">Precios / stock</dt><dd className="m-0 font-extrabold">{last.prices_changed} / {last.stock_changed}</dd>
              <dt className="text-muted">Activados / ocultos</dt><dd className="m-0 font-extrabold">{last.activated} / {last.deactivated}</dd>
              <dt className="text-muted">Errores</dt><dd className="m-0 font-extrabold">{last.error_count}</dd>
            </dl>
          ) : (
            <p className="m-0 text-[14px] text-muted">Todavía no se ha sincronizado.</p>
          )}
        </Panel>
        <Panel title="Sincronizar" hint="El administrador decide: la visibilidad manual de cada producto nunca se modifica.">
          <form action={syncCatalogNowAction}>
            <button type="submit" className="press min-h-12 w-full rounded-[14px] bg-brand px-5 text-[15px] font-extrabold text-ink">Sincronizar ahora</button>
          </form>
          <form action={importCatalogCsvAction} className="flex flex-col gap-2 border-t border-line pt-3">
            <label className="flex flex-col gap-1 text-[13px] font-bold">
              Cargar un CSV del catálogo (máx. 5 MB)
              <input type="file" name="file" accept=".csv,text/csv" required className="text-[14px] font-semibold" />
            </label>
            <button type="submit" className="press min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold">Importar CSV</button>
          </form>
        </Panel>
      </div>
      <Panel title="Historial de sincronizaciones">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          {(runs ?? []).map((x) => {
            const s = STATUS[x.status as keyof typeof STATUS] ?? ["—", "bg-paper"];
            const errs = (x.errors as { type: string; ref?: string | null }[]) ?? [];
            const warns = (x.warnings as { type: string; ref?: string; from?: number; to?: number }[]) ?? [];
            return (
              <li key={x.id} className="flex flex-col gap-1 py-3 text-[14px]">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-extrabold">{fmtDateTime(x.started_at)} · {x.run_type === "automatic" ? "Automática" : x.run_type === "import" ? "Importación" : "Manual"}</span>
                  <span className={`rounded-full px-3 py-1 text-[12.5px] font-extrabold ${s[1]}`}>{s[0]}</span>
                </div>
                <span className="text-muted">{x.products_seen} vistos · {x.products_created} nuevos · {x.products_updated} actualizados · {x.prices_changed} precios · {x.deactivated} ocultos · {x.activated} reactivados · {x.duration_ms ?? 0} ms</span>
                {errs.length ? <span className="text-danger">Errores: {errs.slice(0, 5).map((e) => `${e.type}${e.ref ? ` (${e.ref})` : ""}`).join(", ")}{errs.length > 5 ? "…" : ""}</span> : null}
                {warns.length ? <span className="text-warn">Alertas: {warns.slice(0, 5).map((w) => (w.type === "price_jump" ? `salto de precio ${w.ref}: ${w.from}→${w.to}` : `${w.type} ${w.ref ?? ""}`)).join(" · ")}{warns.length > 5 ? "…" : ""}</span> : null}
              </li>
            );
          })}
          {(runs ?? []).length === 0 ? <li className="py-3 text-muted">Sin registros.</li> : null}
        </ul>
      </Panel>
      <Panel title="Productos con más consultas por WhatsApp (30 días)" hint="Solo producto y hora; sin datos personales.">
        {topList.length ? (
          <ol className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
            {topList.map((t) => (
              <li key={t.name} className="flex justify-between gap-3"><span className="truncate">{t.name}</span><span>{t.n}</span></li>
            ))}
          </ol>
        ) : (
          <p className="m-0 text-[14px] text-muted">Aún no hay consultas.</p>
        )}
      </Panel>
      <TextLink href="/b/tienda" className="w-fit">← Productos</TextLink>
    </section>
  );
}
