import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui/detail";
import { StatCard } from "@/components/ui/kit";
import { fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { LEGAL_SLUGS, pendingMarkers } from "@/lib/domain/legal";
import { createClient } from "@/lib/supabase/server";
import { deleteLegalDraftAction, publishLegalAction } from "./actions";
import { LegalDraftForm } from "./draft-form";
import { FillPlaceholdersForm } from "./forms";

export const metadata: Metadata = { title: "Centro legal", robots: { index: false } };

const STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "Borrador", cls: "bg-warn-soft text-warn" },
  published: { label: "Vigente", cls: "bg-ok-soft text-ok" },
  retired: { label: "Retirado", cls: "bg-[#EDEDEA] text-ink-2" },
};

/** Centro legal: documentos, versiones, vigencia, publicación, historial y aceptaciones por versión. Solo SUPERADMIN. */
export default async function LegalAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const supabase = await createClient();
  const [{ data }, { data: accepts }] = await Promise.all([
    supabase.from("legal_documents").select("id, slug, version, title, status, published_at, requires_acceptance, content").order("slug").order("version", { ascending: false }),
    supabase.from("legal_acceptances").select("legal_document_id").limit(20000),
  ]);
  const docs = data ?? [];
  const acceptedBy = new Map<string, number>();
  for (const a of accepts ?? []) acceptedBy.set(a.legal_document_id, (acceptedBy.get(a.legal_document_id) ?? 0) + 1);
  const pendingBy = new Map(docs.filter((d) => d.status === "draft").map((d) => [d.id, pendingMarkers(d.content)]));
  const allPending = [...new Set([...pendingBy.values()].flat())];
  const published = docs.filter((d) => d.status === "published").length;
  const drafts = docs.filter((d) => d.status === "draft").length;
  return (
    <section className="flex flex-col gap-5">
      <PageTitle title="Centro legal" subtitle="Cada versión publicada es inmutable y las aceptaciones quedan ligadas a la versión exacta. Los textos deben ser revisados por un abogado colombiano antes de publicarlos." />
      {sp.ok === "publicado" ? <p role="status" className="m-0 rounded-[14px] bg-ok-soft px-4 py-3 text-[14px] font-bold text-ok">Documento publicado. Ya es público en /legal y se pedirá la aceptación a quien corresponda.</p> : null}
      {sp.error === "pendientes" ? <p role="alert" className="m-0 rounded-[14px] bg-danger-soft px-4 py-3 text-[14px] font-bold text-danger">No se puede publicar: el borrador aún tiene campos «[PENDIENTE: …]». Complétalos y vuelve a intentarlo.</p> : null}
      {sp.error === "publicar" ? <p role="alert" className="m-0 rounded-[14px] bg-danger-soft px-4 py-3 text-[14px] font-bold text-danger">No pudimos publicar el documento.</p> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard value={published} label="Documentos vigentes" icon="scale" tone="dark" />
        <StatCard value={drafts} label="Borradores" icon="quote" />
        <StatCard value={allPending.length} label="Datos pendientes" icon="lock" />
        <StatCard value={[...acceptedBy.values()].reduce((a, b) => a + b, 0)} label="Aceptaciones registradas" icon="users" />
      </div>
      {allPending.length ? (
        <Panel title="Datos pendientes en los borradores" hint="Mientras falten, la base de datos no permite publicar los documentos que los contienen. Complétalos una sola vez y se aplican a todos los borradores.">
          <FillPlaceholdersForm pending={allPending} />
        </Panel>
      ) : null}
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-4">
          {LEGAL_SLUGS.map((s) => {
            const versions = docs.filter((d) => d.slug === s.slug);
            const live = versions.find((v) => v.status === "published");
            return (
              <Panel key={s.slug} title={s.label} hint={live ? `Versión vigente: v${live.version}${live.published_at ? ` · publicada el ${fmtDate(live.published_at)}` : ""}` : "Sin versión publicada"}>
                {versions.length === 0 ? <p className="m-0 text-[13px] text-muted">Aún no hay versiones.</p> : null}
                <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                  {versions.map((v) => {
                    const pend = pendingBy.get(v.id)?.length ?? 0;
                    const st = STATUS[v.status] ?? STATUS.retired;
                    return (
                      <li key={v.id} className="flex flex-col gap-2 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[14.5px] font-extrabold">Versión {v.version}</span>
                          <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${st.cls}`}>{st.label}</span>
                        </div>
                        <span className="text-[12.5px] font-semibold text-muted">
                          {v.published_at ? `Publicada el ${fmtDate(v.published_at)} · ` : ""}
                          {acceptedBy.get(v.id) ?? 0} aceptaciones
                          {v.requires_acceptance ? " · se acepta al registrarse" : ""}
                          {v.status === "draft" && pend ? ` · ${pend} dato(s) pendiente(s)` : ""}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <Link href={`/b/legal/${v.id}`} className="flex min-h-11 items-center rounded-[12px] border border-line-strong bg-white px-4 text-[13px] font-extrabold text-ink no-underline">{v.status === "draft" ? "Revisar" : "Ver"}</Link>
                          {v.status === "draft" ? (
                            <>
                              <form action={publishLegalAction}>
                                <input type="hidden" name="id" value={v.id} />
                                <button type="submit" disabled={pend > 0} title={pend ? "Completa los datos pendientes primero" : undefined} className="min-h-11 rounded-[12px] bg-brand px-4 text-[13px] font-extrabold text-ink disabled:opacity-50">Publicar</button>
                              </form>
                              <form action={deleteLegalDraftAction}>
                                <input type="hidden" name="id" value={v.id} />
                                <button type="submit" className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[13px] font-extrabold text-danger">Eliminar borrador</button>
                              </form>
                            </>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            );
          })}
        </div>
        <Panel title="Nuevo borrador" hint="Una versión nueva no reemplaza a la vigente hasta que la publiques.">
          <LegalDraftForm />
        </Panel>
      </div>
    </section>
  );
}
