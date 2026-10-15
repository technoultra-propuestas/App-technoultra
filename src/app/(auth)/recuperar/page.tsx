import type { Metadata } from "next";
import { AuthShell } from "@/components/ui/AuthShell";
import { RecoverForm } from "../forms";

export const metadata: Metadata = { title: "Recupera tu contraseña", robots: { index: false } };

export default function RecoverPage() {
  return (
    <AuthShell
      title="Recupera tu contraseña"
      back="/login"
      subtitle="Te enviamos un enlace por correo para crear una nueva."
    >
      <RecoverForm />
    </AuthShell>
  );
}
