import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/ui/AuthShell";
import { createClient } from "@/lib/supabase/server";
import { CheckEmailPanel } from "../forms";

export const metadata: Metadata = { title: "Revisa tu correo", robots: { index: false } };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  if (!/^[^s@]+@[^s@]+.[^s@]+$/.test(email) || email.length > 254) redirect("/login");
  const mode = sp.mode === "recovery" ? "recovery" : "signup";
  // Quien ya confirmó (otra pestaña, o vuelve atrás tras confirmar) no necesita esta pantalla: "/" decide onboarding o su inicio.
  const { data } = await (await createClient()).auth.getUser();
  if (data.user) redirect("/");
  return (
    <AuthShell
      title="Revisa tu correo"
      back={mode === "recovery" ? "/recuperar" : "/registro"}
      subtitle={
        mode === "recovery"
          ? `Si existe una cuenta con ${email}, te enviamos un enlace para crear una contraseña nueva.`
          : `Te enviamos un enlace de verificación a ${email}. Abre el correo y haz clic en el enlace para confirmar tu cuenta. Después volverás automáticamente a TechnoUltra.`
      }
    >
      <CheckEmailPanel email={email} mode={mode} />
    </AuthShell>
  );
}
