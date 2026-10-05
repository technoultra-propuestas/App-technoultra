import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { OnboardingShell } from "./shell";
import {
  AddressStep,
  BackButton,
  EquipmentStep,
  LegalStep,
  NotificationsStep,
  PhoneStep,
  WelcomeStep,
} from "./steps";

export const metadata: Metadata = { title: "Configura tu cuenta", robots: { index: false } };

const TITLES = [
  "Te damos la bienvenida",
  "Tu celular",
  "Tu dirección",
  "Tu primer equipo",
  "Avisos",
  "Documentos",
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

  return (
    <OnboardingShell step={step} title={TITLES[step]} subtitle={SUBTITLES[step]}>
      {step === 0 ? <WelcomeStep name={profile.full_name} /> : null}
      {step === 1 ? <PhoneStep /> : null}
      {step === 2 ? <AddressStep cities={cities} /> : null}
      {step === 3 ? <EquipmentStep /> : null}
      {step === 4 ? <NotificationsStep /> : null}
      {step === 5 ? <LegalStep docs={docs} /> : null}
      {step > 0 ? <BackButton /> : null}
    </OnboardingShell>
  );
}
