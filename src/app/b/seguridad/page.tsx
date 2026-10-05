import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { revokeOtherSessionsAction } from "./actions";
import { ChangePasswordForm } from "./forms";

export const metadata: Metadata = { title: "Seguridad de la cuenta", robots: { index: false } };

/** Seguridad del personal: estado del MFA, sesiones y cambio de contraseña con reautenticación. */
export default async function SecurityPage() {
  const profile = await requireRole(["technician", "superadmin"]);
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = (factors?.totp ?? []).filter((f) => f.status === "verified");
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-6">
      <PageTitle title="Seguridad de la cuenta" subtitle={`${profile.email} · ${profile.role === "superadmin" ? "Superadmin" : "Técnico"}`} />
      <Card className="flex flex-col gap-2">
        <h2 className="m-0 text-[19px] font-extrabold">Verificación en dos pasos</h2>
        {totp.length ? (
          <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
            {totp.map((f) => (
              <li key={f.id}>
                ✓ {f.friendly_name ?? "Autenticador"} · activado el {new Date(f.created_at).toLocaleDateString("es-CO")}
              </li>
            ))}
          </ul>
        ) : (
          <p className="m-0 text-[14px] text-ink-2">Sin autenticador. Vuelve a iniciar sesión para configurarlo.</p>
        )}
        <p className="m-0 text-[13px] text-muted">Si pierdes tu teléfono, un administrador puede restablecer tu verificación desde Usuarios.</p>
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[19px] font-extrabold">Cambiar contraseña</h2>
        <p className="m-0 text-[14px] text-ink-2">Por seguridad pedimos tu contraseña actual y un código de tu autenticador. Al terminar se cierran tus otras sesiones.</p>
        <ChangePasswordForm />
      </Card>
      <Card className="flex flex-col gap-3">
        <h2 className="m-0 text-[19px] font-extrabold">Sesiones</h2>
        <p className="m-0 text-[14px] text-ink-2">Cierra tu sesión en otros dispositivos si crees que alguien más pudo entrar.</p>
        <form action={revokeOtherSessionsAction}>
          <button className="min-h-11 rounded-[12px] border border-line-strong bg-white px-4 text-[14px] font-extrabold">Cerrar otras sesiones</button>
        </form>
      </Card>
    </section>
  );
}
