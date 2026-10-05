import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/ui/AuthShell";
import { IconBadge } from "@/components/ui/icons";
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
    <AuthShell title="Inicia sesión" back="/">
      <GoogleButton next={next || undefined} />
      <div className="flex items-center gap-3 text-[13px] font-bold text-muted" aria-hidden>
        <span className="h-px flex-1 bg-line" /> o con tu correo <span className="h-px flex-1 bg-line" />
      </div>
      <LoginForm next={next || undefined} notice={sp.error ? NOTICES[sp.error] : undefined} />
      <p className="m-0 text-center text-[15px] font-semibold text-muted">
        ¿No tienes cuenta?{" "}
        <Link
          href="/registro"
          className="font-extrabold text-ink underline decoration-brand underline-offset-[3px]"
        >
          Crear cuenta
        </Link>
      </p>
      <div className="mt-auto flex flex-col gap-2.5 border-t border-[#E2E2DF] pt-5">
        <div className="text-[13px] font-bold tracking-[0.04em] text-muted">
          ACCESO DEL EQUIPO TECHNOULTRA
        </div>
        <Link
          href="/equipo"
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] bg-ink text-[15px] font-extrabold text-white no-underline"
        >
          <IconBadge width={20} height={20} className="text-brand" />
          Ingresar como equipo TechnoUltra
        </Link>
      </div>
    </AuthShell>
  );
}
