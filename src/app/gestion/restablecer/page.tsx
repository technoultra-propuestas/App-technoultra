import type { Metadata } from "next";
import Link from "next/link";
import { StaffAuthShell } from "@/components/ui/StaffAuthShell";
import { getAal, isEmailLinkSession, requireStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ChallengeForm, StaffResetPasswordForm } from "../forms";

export const metadata: Metadata = { title: "Nueva contraseña · Gestión", robots: { index: false, follow: false } };

/**
 * Llegada desde el enlace de recuperación/invitación (sesión aal1 SIN privilegios: la BD no les da rol hasta aal2).
 * Con MFA ya configurado, primero se verifica el autenticador y solo entonces se permite fijar la contraseña.
 */
export default async function StaffResetPage() {
  await requireStaffSession();
  const { aal, amr } = await getAal();
  const fromEmailLink = isEmailLinkSession(amr);
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const hasMfa = (factors?.totp ?? []).some((f) => f.status === "verified");
  if (!fromEmailLink) {
    return (
      <StaffAuthShell title="Enlace no válido" subtitle="Este enlace ya no es válido o no corresponde a esta sesión." back={{ href: "/gestion/recuperar", label: "Pedir un enlace nuevo" }}>
        <p className="m-0 text-[15px] leading-snug text-ink-2">
          Si ya iniciaste sesión y quieres cambiar tu contraseña, hazlo desde <Link href="/b/seguridad" className="font-bold underline decoration-brand">Seguridad</Link>.
        </p>
      </StaffAuthShell>
    );
  }
  const needsMfa = hasMfa && aal !== "aal2";
  return (
    <StaffAuthShell
      title={needsMfa ? "Verifica tu identidad" : "Crea tu contraseña"}
      subtitle={needsMfa ? "Antes de cambiar la contraseña, escribe el código de tu aplicación autenticadora." : "Elige una contraseña nueva. Después te pediremos tu verificación en dos pasos."}
    >
      {needsMfa ? <ChallengeForm next="/gestion/restablecer" /> : <StaffResetPasswordForm />}
    </StaffAuthShell>
  );
}
