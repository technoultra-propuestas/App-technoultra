import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Panel", robots: { index: false } };

export default async function StaffHome() {
  const profile = await requireRole(["technician", "superadmin"]);
  const supabase = await createClient();
  // RLS limita el conteo: el técnico solo cuenta sus tickets asignados; el administrador, todos.
  const open = await supabase
    .from("tickets")
    .select("id", { count: "exact", head: true })
    .not("status", "in", "(delivered,cancelled)");
  const requests =
    profile.role === "superadmin"
      ? await supabase
          .from("service_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "pending")
      : null;
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">
          {profile.role === "superadmin" ? "Panel de administración" : "Mis tickets"}
        </h1>
        <div className="h-1 w-10 rounded-sm bg-brand" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
        <div className="flex flex-col gap-1 rounded-[20px] bg-ink p-5 text-white">
          <span className="text-[34px] font-extrabold leading-none text-brand">{open.count ?? 0}</span>
          <span className="text-[14px] font-semibold text-[#C9C9C5]">Tickets abiertos</span>
        </div>
        {requests ? (
          <div className="flex flex-col gap-1 rounded-[20px] border border-line bg-white p-5">
            <span className="text-[34px] font-extrabold leading-none">{requests.count ?? 0}</span>
            <span className="text-[14px] font-semibold text-muted">Solicitudes por atender</span>
          </div>
        ) : null}
      </div>
      {profile.role === "superadmin" ? (
        <Link
          href="/b/usuarios"
          className="w-fit rounded-2xl bg-brand px-5 py-3.5 text-[16px] font-extrabold text-ink no-underline"
        >
          Gestionar usuarios del equipo
        </Link>
      ) : null}
    </section>
  );
}
