import type { Metadata } from "next";
import { Avatar } from "@/components/ui/kit";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InviteStaffForm } from "./invite-form";
import { resetStaffMfaAction, setUserActiveAction } from "./actions";

export const metadata: Metadata = { title: "Usuarios del equipo", robots: { index: false } };

type Row = { id: string; full_name: string; email: string; role: "technician" | "superadmin"; is_active: boolean };

export default async function UsersPage() {
  const me = await requireRole(["superadmin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .in("role", ["technician", "superadmin"])
    .is("deleted_at", null)
    .order("role")
    .order("full_name");
  const rows = (data ?? []) as Row[];

  return (
    <section className="flex flex-col gap-6">
      <PageTitle title="Usuarios del equipo" subtitle="Técnicos y administradores se crean aquí. No existe registro público para el equipo." />
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((u) => (
            <li
              key={u.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-white px-5 py-4 shadow-card"
            >
              <Avatar name={u.full_name || u.email} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[16px] font-extrabold">{u.full_name || u.email}</div>
                <div className="truncate text-[13px] font-semibold text-muted">
                  {u.email} · {u.role === "superadmin" ? "Superadmin" : "Técnico"} ·{" "}
                  {u.is_active ? "Activo" : "Desactivado"}
                </div>
              </div>
              {u.id !== me.id ? (
                <div className="flex flex-wrap justify-end gap-2">
                <form action={resetStaffMfaAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <button type="submit" className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold" title="Si perdió su teléfono: deberá configurar el autenticador de nuevo">
                    Restablecer MFA
                  </button>
                </form>
                <form action={setUserActiveAction}>
                  <input type="hidden" name="userId" value={u.id} />
                  <input type="hidden" name="active" value={u.is_active ? "false" : "true"} />
                  <button
                    type="submit"
                    className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold"
                  >
                    {u.is_active ? "Desactivar" : "Activar"}
                  </button>
                </form>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
        <InviteStaffForm />
      </div>
    </section>
  );
}
