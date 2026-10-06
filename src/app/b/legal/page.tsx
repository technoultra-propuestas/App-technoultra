import type { Metadata } from "next";
import Link from "next/link";
import { Card, fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { LEGAL_SLUGS, pendingMarkers } from "@/lib/domain/legal";
import { createClient } from "@/lib/supabase/server";
import { deleteLegalDraftAction, publishLegalAction } from "./actions";
import { LegalDraftForm } from "./draft-form";
import { FillPlaceholdersForm } from "./forms";

export const metadata: Metadata = { title: "Centro legal", robots: { index: false } };

const STATUS: Record<string, string> = { draft: "Borrador", published: "Publicado", retired: "Retirado" };

export default async function LegalAdminPage({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  await requireRole(["superadmin"]);
  const sp = await searchParams;
  const { data } = await (await createClient()).from("legal_documents").select("id, slug, version, title, status, published_at, requires_acceptance, content").order("slug").order("version", { ascending: false });
  const docs = data ?? [];
  const pendingBy = new Map(docs.filter((d) => d.status === "draft").map((d) => [d.id, pendingMarkers(d.content)]));
  const allPending = [...new Set([...pendingBy.values()].flat())];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Centro legal"
        subtitle="Cada versión publicada es inmutable y las aceptaciones quedan ligadas a la versión exacta. Los textos deben ser revisados por un abogado colombiano antes de publicarlos."
      />
      {sp.ok === "publicado" ? <p role="status" className="m-0 rounded-xl bg-[#E3F3E8] px-4 py-3 text-[14px] font-bold text-[#1F6B3A]">Documento publicado. Ya es público en /legal.</p> : null}
      {sp.error === "pendientes" ? <p role="alert" className="m-0 rounded-xl bg-[#FBE4E1] px-4 py-3 text-[14px] font-bold text-[#9A2B1E]">No se puede publicar: el borrador aún tiene campos «[PENDIENTE: …]». Complétalos y vuelve a intentarlo.</p> : null}
      {sp.error === "publicar" ? <p role="alert" className="m-0 rounded-xl bg-[#FBE4E1] px-4 py-3 text-[14px] font-bold text-[#9A2B1E]">No pudimos publicar el documento.</p> : null}
      {allPending.length ? (
        <Card className="flex flex-col gap-3 border-[#FFE9A8] bg-[#FFFBEF]">
          <h2 className="m-0 text-[18px] font-extrabold">Datos pendientes en los borradores</h2>
          <p className="m-0 text-[14px] text-ink-2">Mientras estos datos falten, la base de datos no permite publicar los documentos que los contienen. Complétalos una sola vez y se aplican a todos los borradores.</p>
          <FillPlaceholdersForm pending={allPending} />
        </Card>
      ) : null}
      <div className="grid gap-6 md:grid-cols-[1fr_400px]">
        <div className="flex flex-col gap-4">
          {LEGAL_SLUGS.map((s) => {
            const versions = docs.filter((d) => d.slug === s.slug);
            const published = versions.find((v) => v.status === "published");
            return (
              <Card key={s.slug} className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="m-0 text-[17px] font-extrabold">{s.label}</h2>
                  <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${published ? "bg-[#E3F3E8] text-[#1F6B3A]" : "bg-[#FBF1D9] text-[#6E4B00]"}`}>{published ? `v${published.version} vigente` : "Sin publicar"}</span>
                </div>
                {versions.length === 0 ? <p className="m-0 text-[13px] text-muted">Aún no hay versiones.</p> : null}
                <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[14px] font-semibold">
                  {versions.map((v) => {
                    const pend = pendingBy.get(v.id)?.length ?? 0;
                    return (
                      <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span>
                          v{v.version} · {STATUS[v.status]}
                          {v.published_at ? ` · ${fmtDate(v.published_at)}` : ""}
                          {v.requires_acceptance ? " · se acepta al registrarse" : ""}
                          {v.status === "draft" && pend ? ` · ${pend} dato(s) pendiente(s)` : ""}
                        </span>
                        <span className="flex flex-wrap gap-2">
                          <Link href={`/b/legal/${v.id}`} className="flex min-h-10 items-center rounded-[10px] border border-line-strong bg-white px-3 text-[13px] font-extrabold text-ink no-underline">
                            {v.status === "draft" ? "Revisar" : "Ver"}
                          </Link>
                          {v.status === "draft" ? (
                            <>
                              <form action={publishLegalAction}>
                                <input type="hidden" name="id" value={v.id} />
                                <button type="submit" disabled={pend > 0} title={pend ? "Completa los datos pendientes primero" : undefined} className="min-h-10 rounded-[10px] bg-brand px-3 text-[13px] font-extrabold text-ink disabled:opacity-50">
                                  Publicar
                                </button>
                              </form>
                              <form action={deleteLegalDraftAction}>
                                <input type="hidden" name="id" value={v.id} />
                                <button type="submit" className="min-h-10 rounded-[10px] border border-line-strong bg-white px-3 text-[13px] font-extrabold text-[#9A2B1E]">Eliminar borrador</button>
                              </form>
                            </>
                          ) : null}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            );
          })}
        </div>
        <Card className="h-fit">
          <h2 className="m-0 mb-4 text-[19px] font-extrabold">Nuevo borrador</h2>
          <LegalDraftForm />
        </Card>
      </div>
    </section>
  );
}
