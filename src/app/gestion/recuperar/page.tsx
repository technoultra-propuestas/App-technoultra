import type { Metadata } from "next";
import { StaffAuthShell } from "@/components/ui/StaffAuthShell";
import { StaffRecoveryForm } from "../forms";

export const metadata: Metadata = { title: "Recuperar contraseña · Gestión", robots: { index: false, follow: false } };

export default async function StaffRecoverPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sent = (await searchParams).enviado === "1";
  return (
    <StaffAuthShell
      title={sent ? "Revisa tu correo" : "Recuperar contraseña"}
      subtitle={sent ? "Si existe una cuenta del equipo con ese correo, te enviamos un enlace para crear una contraseña nueva. Ábrelo desde este mismo navegador." : "Te enviaremos un enlace para crear una contraseña nueva. Después tendrás que verificar tu autenticador."}
      back={{ href: "/gestion/login", label: "Volver a gestión" }}
    >
      {sent ? <p className="m-0 text-[15px] leading-snug text-ink-2">¿No llega? Revisa Spam o Promociones. El enlace tiene vigencia limitada.</p> : <StaffRecoveryForm />}
    </StaffAuthShell>
  );
}
