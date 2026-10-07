import type { Metadata } from "next";
import Link from "next/link";
import { Avatar, ListRow } from "@/components/ui/kit";
import { Panel } from "@/components/ui/detail";
import { fmtDate } from "@/components/ui/layout";
import { SignOutRow } from "@/components/ui/SignOut";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PreferencesForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Mi perfil", robots: { index: false } };

type Rel<T> = T | T[] | null;
const one = <T,>(v: Rel<T>): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

/** Perfil del cliente en secciones: datos personales, avisos, direcciones, documentos aceptados (con versión y fecha) y privacidad. */
export default async function ProfilePage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();
  const [{ data: customer }, { data: prefs }, { data: accepted }] = await Promise.all([
    supabase.from("customers").select("full_name, phone, document_type, document_number, company_name").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("notification_preferences").select("email_enabled").eq("profile_id", profile.id).maybeSingle(),
    supabase.from("legal_acceptances").select("id, accepted_at, legal_documents(title, version, slug)").eq("profile_id", profile.id).order("accepted_at", { ascending: false }).limit(20),
  ]);
  const name = customer?.full_name ?? profile.full_name;
  return (
    <section className="flex flex-col gap-5">
      <header className="flex items-center gap-4">
        <Avatar name={name} size={56} />
        <div className="min-w-0">
          <h1 className="m-0 truncate text-[26px] font-extrabold leading-tight tracking-[-0.02em]">{name}</h1>
          <p className="m-0 truncate text-[14px] font-semibold text-muted">{profile.email}</p>
        </div>
      </header>
      <div className="grid grid-cols-[minmax(0,1fr)] gap-5 lg:grid-cols-[minmax(0,1fr)_400px] lg:items-start">
        <div className="flex flex-col gap-5">
          <Panel title="Datos personales" hint="Los usamos para tus tickets, cotizaciones y documentos.">
            <ProfileForm
              values={{
                full_name: name,
                phone: customer?.phone ?? null,
                document_type: customer?.document_type ?? null,
                document_number: customer?.document_number ?? null,
                company_name: customer?.company_name ?? null,
                email: profile.email,
              }}
            />
          </Panel>
          <Panel title="Documentos aceptados" hint="Constancia de tus aceptaciones: documento, versión y fecha. Si publicamos una versión nueva, te la pediremos aparte y esta constancia se conserva.">
            {(accepted ?? []).length === 0 ? (
              <p className="m-0 text-[14px] text-muted">Aún no hay aceptaciones registradas.</p>
            ) : (
              <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
                {(accepted ?? []).map((a) => {
                  const d = one(a.legal_documents as Rel<{ title: string; version: number; slug: string }>);
                  return (
                    <li key={a.id} className="flex min-h-12 items-center justify-between gap-3 text-[14px]">
                      <span className="min-w-0">
                        <span className="block truncate font-extrabold">{d?.title ?? "Documento"}</span>
                        <span className="text-[12.5px] font-semibold text-muted">Versión {d?.version ?? "—"} · aceptado el {fmtDate(a.accepted_at)}</span>
                      </span>
                      {d ? <Link href={`/legal/${d.slug}`} target="_blank" className="flex min-h-11 flex-none items-center font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Leer</Link> : null}
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
        <aside className="flex flex-col gap-5">
          <Panel title="Avisos">
            <PreferencesForm emailEnabled={prefs?.email_enabled ?? true} />
          </Panel>
          <div className="rounded-card border border-line bg-white p-2 shadow-card">
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              <li><ListRow href="/c/direcciones" title="Mis direcciones" detail="Dónde recogemos o atendemos" icon="map" tone="neutral" /></li>
              <li><ListRow href="/c/equipos" title="Mis equipos" detail="Historial y garantías" icon="box" tone="neutral" /></li>
              <li><ListRow href="/legal/data_policy" title="Tratamiento de datos personales" detail="Cómo cuidamos tu información" icon="shield" tone="neutral" /></li>
              <li><ListRow href="/legal/terms" title="Términos y condiciones" detail="Las reglas del servicio" icon="quote" tone="neutral" /></li>
              <li><ListRow href="/c/ayuda" title="Ayuda" detail="Preguntas frecuentes y contacto" icon="inbox" tone="neutral" /></li>
            </ul>
          </div>
          <SignOutRow />
        </aside>
      </div>
    </section>
  );
}
