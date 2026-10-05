import type { Metadata } from "next";
import Link from "next/link";
import { Card, LinkButton, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PreferencesForm, ProfileForm } from "./forms";

export const metadata: Metadata = { title: "Mi perfil", robots: { index: false } };

export default async function ProfilePage() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();
  const [{ data: customer }, { data: prefs }] = await Promise.all([
    supabase
      .from("customers")
      .select("full_name, phone, document_type, document_number, company_name")
      .eq("profile_id", profile.id)
      .maybeSingle(),
    supabase
      .from("notification_preferences")
      .select("email_enabled")
      .eq("profile_id", profile.id)
      .maybeSingle(),
  ]);
  return (
    <section className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <PageTitle title="Mi perfil" />
        <Card>
          <ProfileForm
            values={{
              full_name: customer?.full_name ?? profile.full_name,
              phone: customer?.phone ?? null,
              document_type: customer?.document_type ?? null,
              document_number: customer?.document_number ?? null,
              company_name: customer?.company_name ?? null,
              email: profile.email,
            }}
          />
        </Card>
      </div>
      <aside className="flex flex-col gap-4 md:pt-[72px]">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Avisos</h2>
          <PreferencesForm emailEnabled={prefs?.email_enabled ?? true} />
        </Card>
        <LinkButton href="/c/direcciones" variant="ghost">
          Mis direcciones
        </LinkButton>
        <Card className="flex flex-col gap-2 text-[14px] font-semibold">
          <Link href="/legal/terms" className="underline decoration-brand underline-offset-[3px]">
            Términos y condiciones
          </Link>
          <Link href="/legal/data_policy" className="underline decoration-brand underline-offset-[3px]">
            Tratamiento de datos personales
          </Link>
        </Card>
      </aside>
    </section>
  );
}
