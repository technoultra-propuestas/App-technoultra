import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { signOutAction } from "@/app/(auth)/actions";
import { StaffAuthShell } from "@/components/ui/StaffAuthShell";
import { safeNext } from "@/lib/auth/routes";
import { getAal, requireStaffSession } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { ChallengeForm, EnrollPanel } from "../forms";

export const metadata: Metadata = { title: "Verificación en dos pasos", robots: { index: false, follow: false } };

/** Segundo factor del personal. La decisión sale de Supabase Auth (factores y nivel aal), nunca de una columna propia. */
export default async function StaffMfaPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const profile = await requireStaffSession();
  const raw = (await searchParams).next;
  const n = raw ? safeNext(raw, "/b") : "/b";
  const next = n === "/b" || n.startsWith("/b/") ? n : "/b";
  if ((await getAal()).aal === "aal2") redirect(next);
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const enrolled = (factors?.totp ?? []).some((f) => f.status === "verified");
  return (
    <StaffAuthShell
      title={enrolled ? "Verificación en dos pasos" : "Protege tu cuenta"}
      subtitle={enrolled ? `Hola, ${profile.full_name.split(" ")[0] || "equipo"}. Escribe el código de tu aplicación autenticadora para continuar.` : "El acceso del equipo exige verificación en dos pasos. Configúrala ahora; tarda un minuto."}
    >
      <div className="flex flex-col gap-4">
        {enrolled ? <ChallengeForm next={next === "/b" ? undefined : next} /> : <EnrollPanel next={next === "/b" ? undefined : next} />}
        <form action={signOutAction} className="flex justify-center">
          <button className="min-h-11 text-[14px] font-bold text-muted underline decoration-brand underline-offset-[3px]">Cerrar sesión</button>
        </form>
      </div>
    </StaffAuthShell>
  );
}
