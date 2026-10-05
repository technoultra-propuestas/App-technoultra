import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { InviteStaffForm } from "./invite-form";
import { setUserActiveAction } from "./actions";

export const metadata: Metadata = { title: "Usuarios del equipo", robots: { index: false } };

type Row = { id: string; full_name: string; email: string; role: "technician" | "admin"; is_active: boolean };

export default async function UsersPage() {
  const me = await requireRole(["admin"]);
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .in("role", ["technician", "admin"])
    .is("deleted_at", null)
    .order("role")
    .order("full_name");
  const rows = (data ?? []) as Row[];

  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Usuarios del equipo</h1>
        <div className="h-1 w-10 rounded-sm bg-brand" />
        <p className="m-0 text-base text-muted">
          Técnicos y administradores se crean aquí. No existe registro público para el equipo.
        </p>
      </div>
      <div className="grid gap-6 md:grid-cols-[1fr_380px]">
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {rows.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between gap-3 rounded-[20px] border border-line bg-white px-5 py-4"
            >
              <div className="min-w-0">
                <div className="truncate text-[16px] font-extrabold">{u.full_name || u.email}</div>
                <div className="truncate text-[13px] font-semibold text-muted">
                  {u.email} · {u.role === "admin" ? "Administración" : "Técnico"} ·{" "}
                  {u.is_active ? "Activo" : "Desactivado"}
                </div>
              </div>
              {u.id !== me.id ? (
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
              ) : null}
            </li>
          ))}
        </ul>
        <InviteStaffForm />
      </div>
    </section>
  );
}
