import type { Metadata } from "next";
import { Card, fmtDate, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { LEGAL_SLUGS } from "@/lib/domain/legal";
import { createClient } from "@/lib/supabase/server";
import { deleteLegalDraftAction, publishLegalAction } from "./actions";
import { LegalDraftForm } from "./draft-form";

export const metadata: Metadata = { title: "Centro legal", robots: { index: false } };

const STATUS: Record<string, string> = { draft: "Borrador", published: "Publicado", retired: "Retirado" };

export default async function LegalAdminPage() {
  await requireRole(["superadmin"]);
  const { data } = await (await createClient()).from("legal_documents").select("id, slug, version, title, status, published_at, requires_acceptance").order("slug").order("version", { ascending: false });
  const docs = data ?? [];
  return (
    <section className="flex flex-col gap-6">
      <PageTitle
        title="Centro legal"
        subtitle="Cada versión publicada es inmutable y las aceptaciones quedan ligadas a la versión exacta. Los textos deben ser revisados por un abogado colombiano antes de publicarlos."
      />
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
                  {versions.map((v) => (
                    <li key={v.id} className="flex flex-wrap items-center justify-between gap-2">
                      <span>
                        v{v.version} · {STATUS[v.status]}
                        {v.published_at ? ` · ${fmtDate(v.published_at)}` : ""}
                      </span>
                      {v.status === "draft" ? (
                        <span className="flex gap-2">
                          <form action={publishLegalAction}>
                            <input type="hidden" name="id" value={v.id} />
                            <button type="submit" className="min-h-10 rounded-[10px] bg-brand px-3 text-[13px] font-extrabold text-ink">Publicar</button>
                          </form>
                          <form action={deleteLegalDraftAction}>
                            <input type="hidden" name="id" value={v.id} />
                            <button type="submit" className="min-h-10 rounded-[10px] border border-line-strong bg-white px-3 text-[13px] font-extrabold text-[#9A2B1E]">Eliminar borrador</button>
                          </form>
                        </span>
                      ) : null}
                    </li>
                  ))}
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
