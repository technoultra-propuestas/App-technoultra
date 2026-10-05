import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/ui/AuthShell";
import { VerifyForm } from "../forms";

export const metadata: Metadata = { title: "Escribe el código", robots: { index: false } };

export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const email = (sp.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) redirect("/login");
  const mode = sp.mode === "recovery" ? "recovery" : "signup";
  return (
    <AuthShell
      title="Escribe el código"
      back={mode === "recovery" ? "/recuperar" : "/registro"}
      subtitle={`Si ${email} puede recibir mensajes, enviamos un código de 6 dígitos. Vence en 10 minutos.`}
    >
      <VerifyForm email={email} mode={mode} />
    </AuthShell>
  );
}
