import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { DraftProvider } from "@/components/forms/FormDraft";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OnboardingShell, StepArt } from "./shell";
import {
  AddressStep,
  BackButton,
  EquipmentStep,
  LegalStep,
  NotificationsStep,
  PhoneStep,
  SkipEquipment,
  WelcomeStep,
} from "./steps";

export const metadata: Metadata = { title: "Configura tu cuenta", robots: { index: false } };

/** [texto, palabra destacada en naranja] */
const TITLES: [string, string][] = [
  ["Te damos\nla ", "bienvenida"],
  ["Tu ", "celular"],
  ["Tu ", "dirección"],
  ["Tu primer ", "equipo"],
  ["", "Notificaciones"],
  ["Documentos", ""],
];
const SUBTITLES = [
  undefined,
  "Para coordinar recogidas y entregas.",
  "Verificamos la cobertura del servicio presencial en tu ciudad.",
  "Así agilizamos tus próximas solicitudes. Puedes omitirlo.",
  undefined,
  "Registramos la versión exacta que aceptas.",
];

export default async function OnboardingPage() {
  const profile = await requireRole(["client"]);
  if (profile.onboarding_completed_at) redirect("/c");
  const step = Math.max(0, Math.min(5, profile.onboarding_step));
  const supabase = await createClient();

  const cities =
    step === 2
      ? ((
          await supabase
            .from("coverage_areas")
            .select("dane_code, city_name")
            .eq("is_active", true)
            .order("city_name")
        ).data ?? [])
      : [];
  const docs =
    step === 5
      ? (((await supabase.rpc("pending_legal_documents")).data ?? []) as {
          id: string;
          slug: string;
          title: string;
          version: number;
        }[])
      : [];

  const art = <StepArt step={step} />;

  return (
    <DraftProvider scope={profile.id}>
      <OnboardingShell
        step={step}
        title={
          <>
            {TITLES[step][0]}
            <span className="text-brand">{TITLES[step][1]}</span>
          </>
        }
        subtitle={SUBTITLES[step]}
        skip={step === 3 ? <SkipEquipment /> : undefined}
      >
        {step === 0 ? <WelcomeStep name={profile.full_name} art={art} /> : null}
        {step === 1 ? <PhoneStep art={art} /> : null}
        {step === 2 ? <AddressStep cities={cities} art={art} /> : null}
        {step === 3 ? <EquipmentStep art={art} /> : null}
        {step === 4 ? <NotificationsStep art={art} /> : null}
        {step === 5 ? <LegalStep docs={docs} art={art} /> : null}
        {step > 0 ? <BackButton /> : null}
      </OnboardingShell>
    </DraftProvider>
  );
}
