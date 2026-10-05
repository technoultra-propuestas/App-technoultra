import type { Metadata } from "next";
import { Wordmark } from "@/components/brand/Wordmark";
import { AuthShell } from "@/components/ui/AuthShell";
import { LoginForm } from "../forms";

export const metadata: Metadata = { title: "Acceso del equipo", robots: { index: false } };

/** Solo inicio de sesión: el personal NO puede registrarse. Las cuentas las crea administración. */
export default function StaffLoginPage() {
  return (
    <AuthShell
      title="Acceso del equipo"
      back="/login"
      dark
      subtitle="Técnicos y administración. Tu rol define lo que ves."
    >
      <div className="text-white">
        <Wordmark size={20} />
      </div>
      <div className="rounded-3xl bg-white p-5 text-ink">
        <LoginForm staff />
      </div>
    </AuthShell>
  );
}
