import type { Metadata } from "next";
import Link from "next/link";
import { Card, EmptyState, LinkButton, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { priceText } from "@/lib/domain/catalog";
import { createClient } from "@/lib/supabase/server";
import { deleteCatalogNodeAction, toggleCatalogNodeAction } from "./actions";
import { CategoryForm, SubcategoryForm } from "./service-form";

export const metadata: Metadata = { title: "Catálogo de servicios", robots: { index: false } };

const PAGE = 40;
type Sp = { q?: string; categoria?: string; estado?: string; diagnostico?: string; pagina?: string; resultado?: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inputCls = "h-11 rounded-xl border border-[#D9D9D5] px-3 text-[15px]";

export default async function ServicesAdminPage({ searchParams }: { searchParams: Promise<Sp> }) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const page = Math.max(1, Number.parseInt(sp.pagina ?? "1", 10) || 1);
  const supabase = await createClient();
  let query = supabase
    .from("services")
    .select("id, name, kind, price_mode, base_price, price_unit, price_type_label, parts_extra, requires_diagnosis, is_active, allowed_modalities", { count: "exact" })
    .is("deleted_at", null);
  // Sanea la búsqueda: sin comodines ni separadores de la sintaxis de PostgREST.
  const q = (sp.q ?? "").replace(/[%_,()*\\]/g, " ").trim().slice(0, 60);
  if (q) query = query.ilike("name", `%${q}%`);
  if (sp.categoria && UUID.test(sp.categoria)) query = query.eq("category_id", sp.categoria);
  if (sp.estado === "activos") query = query.eq("is_active", true);
  if (sp.estado === "ocultos") query = query.eq("is_active", false);
  if (sp.diagnostico === "si") query = query.eq("requires_diagnosis", true);
  const [{ data, count }, { data: cats }, { data: subs }] = await Promise.all([
    query.order("kind").order("sort_order").order("name").range((page - 1) * PAGE, page * PAGE - 1),
    supabase.from("service_categories").select("id, name, is_active").order("sort_order"),
    supabase.from("service_subcategories").select("id, name, category_id, is_active").order("category_id").order("sort_order"),
  ]);
  const list = data ?? [];
  const total = count ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE));
  const keep = (over: Partial<Sp>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, resultado: undefined, ...over })) if (v) p.set(k, String(v));
    return `/b/servicios?${p}`;
  };
  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Catálogo de servicios" subtitle="Los precios que ves aquí son los que usa toda la app. Nada está fijo en el código." action={<LinkButton href="/b/servicios/nuevo">Nuevo servicio</LinkButton>} />
      {sp.resultado ? (
        <p role="status" className="m-0 rounded-xl bg-[#E3F3E8] px-4 py-3 text-[14px] font-bold text-[#1F6B3A]">
          {sp.resultado === "archivado" ? "El servicio tiene historial: quedó archivado (oculto) y se conserva." : "Servicio eliminado."}
        </p>
      ) : null}
      <form method="get" className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Buscar
          <input name="q" defaultValue={q} maxLength={60} className={inputCls} />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Categoría
          <select name="categoria" defaultValue={sp.categoria ?? ""} className={inputCls}>
            <option value="">Todas</option>
            {(cats ?? []).map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Estado
          <select name="estado" defaultValue={sp.estado ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="activos">Activos</option>
            <option value="ocultos">Ocultos</option>
          </select>
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-bold">
          Diagnóstico
          <select name="diagnostico" defaultValue={sp.diagnostico ?? ""} className={inputCls}>
            <option value="">Todos</option>
            <option value="si">Requieren diagnóstico</option>
          </select>
        </label>
        <button className="h-11 rounded-xl bg-ink px-5 text-[15px] font-extrabold text-white">Filtrar</button>
      </form>
      <p className="m-0 text-[13px] font-semibold text-muted">
        {total} servicio(s) · <Link href="/b/servicios/reglas">Reglas de precios y fuentes</Link>
      </p>
      <div className="grid gap-6 md:grid-cols-[1fr_340px]">
        {list.length === 0 ? (
          <EmptyState title="No hay servicios con ese filtro" text="Cambia la búsqueda o crea uno nuevo." action={<LinkButton href="/b/servicios/nuevo">Nuevo servicio</LinkButton>} />
        ) : (
          <div className="flex flex-col gap-3">
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {list.map((s) => (
                <li key={s.id}>
                  <Link href={`/b/servicios/${s.id}`} className="block no-underline">
                    <Card className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate text-[16px] font-extrabold text-ink">{s.name}</div>
                        <div className="truncate text-[13px] font-semibold text-muted">
                          {s.kind === "digital" ? "Digital" : "Técnico"} · {priceText(s)}
                          {s.requires_diagnosis ? " · requiere diagnóstico" : ""} · {s.allowed_modalities.join(", ")}
                        </div>
                      </div>
                      <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${s.is_active ? "bg-[#E3F3E8] text-[#1F6B3A]" : "bg-[#EDEDEA] text-ink-2"}`}>{s.is_active ? "Activo" : "Oculto"}</span>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
            {pages > 1 ? (
              <nav aria-label="Paginación" className="flex items-center justify-between text-[14px] font-bold">
                {page > 1 ? <Link href={keep({ pagina: String(page - 1) })}>← Anterior</Link> : <span />}
                <span>
                  Página {page} de {pages}
                </span>
                {page < pages ? <Link href={keep({ pagina: String(page + 1) })}>Siguiente →</Link> : <span />}
              </nav>
            ) : null}
          </div>
        )}
        <div className="flex flex-col gap-6">
          <Card className="h-fit">
            <h2 className="m-0 mb-4 text-[19px] font-extrabold">Nueva categoría</h2>
            <CategoryForm />
          </Card>
          <Card className="h-fit">
            <h2 className="m-0 mb-4 text-[19px] font-extrabold">Nueva subcategoría</h2>
            <SubcategoryForm categories={cats ?? []} />
          </Card>
          <Card className="h-fit">
            <h2 className="m-0 mb-3 text-[19px] font-extrabold">Categorías</h2>
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {(cats ?? []).map((c) => (
                <li key={c.id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between gap-2 text-[14px] font-extrabold">
                    <span className={c.is_active ? "" : "text-muted line-through"}>{c.name}</span>
                    <span className="flex gap-2">
                      <form action={toggleCatalogNodeAction}>
                        <input type="hidden" name="table" value="service_categories" />
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="active" value={String(!c.is_active)} />
                        <button className="min-h-11 text-[13px] font-bold underline">{c.is_active ? "Ocultar" : "Mostrar"}</button>
                      </form>
                      <form action={deleteCatalogNodeAction}>
                        <input type="hidden" name="kind" value="category" />
                        <input type="hidden" name="id" value={c.id} />
                        <button className="min-h-11 text-[13px] font-bold text-[#9A2B1E] underline">Eliminar</button>
                      </form>
                    </span>
                  </div>
                  <ul className="m-0 list-none pl-3 text-[13px] font-semibold text-ink-2">
                    {(subs ?? [])
                      .filter((sc) => sc.category_id === c.id)
                      .map((sc) => (
                        <li key={sc.id} className="flex items-center justify-between gap-2">
                          <span className={sc.is_active ? "" : "line-through"}>{sc.name}</span>
                          <span className="flex gap-2">
                            <form action={toggleCatalogNodeAction}>
                              <input type="hidden" name="table" value="service_subcategories" />
                              <input type="hidden" name="id" value={sc.id} />
                              <input type="hidden" name="active" value={String(!sc.is_active)} />
                              <button className="min-h-11 text-[12px] font-bold underline">{sc.is_active ? "Ocultar" : "Mostrar"}</button>
                            </form>
                            <form action={deleteCatalogNodeAction}>
                              <input type="hidden" name="kind" value="subcategory" />
                              <input type="hidden" name="id" value={sc.id} />
                              <button className="min-h-11 text-[12px] font-bold text-[#9A2B1E] underline">Eliminar</button>
                            </form>
                          </span>
                        </li>
                      ))}
                  </ul>
                </li>
              ))}
            </ul>
            <p className="m-0 mt-3 text-[12px] font-semibold text-muted">Una categoría o subcategoría solo se elimina si no tiene servicios.</p>
          </Card>
        </div>
      </div>
    </section>
  );
}
