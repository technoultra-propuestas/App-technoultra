import type { Metadata } from "next";
import { StaffAuthShell } from "@/components/ui/StaffAuthShell";
import { safeNext } from "@/lib/auth/routes";
import { StaffLoginForm } from "../forms";

export const metadata: Metadata = { title: "Gestión y operaciones", robots: { index: false, follow: false } };

const NOTICES: Record<string, string> = {
  inactive: "Esta cuenta está desactivada. Habla con administración.",
  staff: "Las cuentas del equipo entran solo con correo y contraseña, no con Google.",
  link: "Ese enlace ya se usó, venció o se abrió en otro dispositivo. Pide uno nuevo desde «¿Olvidaste tu contraseña?».",
};

export default async function StaffLoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const next = sp.next ? safeNext(sp.next, "") : "";
  return (
    <StaffAuthShell title="Gestión y operaciones" subtitle="Inicia sesión con tu cuenta del equipo." back={{ href: "/login", label: "Ir al acceso de clientes" }}>
      <StaffLoginForm next={next.startsWith("/b") ? next : undefined} notice={sp.error ? NOTICES[sp.error] : undefined} />
    </StaffAuthShell>
  );
}
