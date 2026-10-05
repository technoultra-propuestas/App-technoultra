import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/ui/AuthShell";
import { GoogleButton, RegisterForm } from "../forms";

export const metadata: Metadata = { title: "Crea tu cuenta", robots: { index: false } };

export default function RegisterPage() {
  return (
    <AuthShell
      title="Crea tu cuenta"
      back="/"
      subtitle="Con tu cuenta ves tus equipos, cotizaciones y garantías en un solo lugar."
    >
      <GoogleButton />
      <div className="flex items-center gap-3 text-[13px] font-bold text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" /> o con tu correo <span className="h-px flex-1 bg-line" />
      </div>
      <RegisterForm />
      <p className="m-0 text-center text-[15px] font-semibold text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link
          href="/login"
          className="font-extrabold text-ink underline decoration-brand underline-offset-[3px]"
        >
          Inicia sesión
        </Link>
      </p>
    </AuthShell>
  );
}
