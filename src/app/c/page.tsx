import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Inicio", robots: { index: false } };

export default async function ClientHome() {
  const profile = await requireRole(["client"]);
  const supabase = await createClient();
  const [{ count: tickets }, { count: equipment }, { count: unread }] = await Promise.all([
    supabase.from("tickets").select("id", { count: "exact", head: true }),
    supabase.from("equipment").select("id", { count: "exact", head: true }).is("deleted_at", null),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
  ]);
  const stats = [
    { label: "Servicios en curso o recientes", value: tickets ?? 0 },
    { label: "Equipos registrados", value: equipment ?? 0 },
    { label: "Avisos sin leer", value: unread ?? 0 },
  ];
  return (
    <section className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">
          Hola, {profile.full_name.split(" ")[0] || "bienvenido"}
        </h1>
        <div className="h-1 w-10 rounded-sm bg-brand" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col gap-1 rounded-[20px] border border-line bg-white p-5">
            <span className="text-[34px] font-extrabold leading-none">{s.value}</span>
            <span className="text-[14px] font-semibold text-muted">{s.label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}
