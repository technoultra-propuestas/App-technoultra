import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/ui/AuthShell";
import { safeNext } from "@/lib/auth/routes";
import { GoogleButton, LoginForm } from "../forms";

export const metadata: Metadata = { title: "Inicia sesión", robots: { index: false } };

const NOTICES: Record<string, string> = {
  inactive: "Esta cuenta está desactivada. Habla con administración.",
  oauth: "No pudimos iniciar sesión con Google. Inténtalo de nuevo.",
  cancelled: "Cancelaste el inicio de sesión con Google. Puedes intentarlo de nuevo cuando quieras.",
  profile: "No pudimos cargar tu perfil. Inténtalo de nuevo o escríbenos si el problema continúa.",
  link: "Ese enlace ya se usó, venció o se abrió en otro dispositivo. Si ya confirmaste tu correo, inicia sesión; si no, pide un correo nuevo desde Crear cuenta.",
  staff: "Las cuentas del equipo entran solo con correo y contraseña, no con Google.",
  rate: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const next = sp.next ? safeNext(sp.next, "") : "";
  return (
    <AuthShell title="Inicia sesión" subtitle="Soluciones tecnológicas para ti." back="/">
      <GoogleButton next={next || undefined} />
      <div className="flex items-center gap-3 text-[13px] font-bold text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" /> o con tu correo <span className="h-px flex-1 bg-line" />
      </div>
      <LoginForm next={next || undefined} notice={sp.error ? NOTICES[sp.error] : undefined} />
      <p className="m-0 flex flex-wrap items-center justify-center gap-x-1 text-center text-[15px] font-semibold text-muted">
        ¿No tienes cuenta?{" "}
        <Link
          href="/registro"
          className="flex min-h-11 items-center font-extrabold text-ink underline decoration-brand underline-offset-[3px]"
        >
          Crear cuenta
        </Link>
      </p>
    </AuthShell>
  );
}
