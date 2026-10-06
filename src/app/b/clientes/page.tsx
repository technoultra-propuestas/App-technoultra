import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/layout";
import { Avatar, SearchField } from "@/components/ui/kit";
import { NavIcon } from "@/components/ui/icons";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Clientes", robots: { index: false } };

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const total = (v: unknown) => (Array.isArray(v) ? Number((v[0] as { count?: number } | undefined)?.count ?? 0) : 0);

export default async function StaffCustomersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await requireRole(["technician", "superadmin"]);
  const q = ((await searchParams).q ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  // RLS decide qué clientes ve cada rol (el técnico solo los de sus tickets); aquí no se filtra por rol.
  const { data } = await supabase
    .from("customers")
    .select("id, full_name, phone, email, equipment(count), tickets(count)")
    .is("deleted_at", null)
    .order("full_name")
    .limit(500);
  const needle = norm(q);
  const rows = (data ?? []).filter((c) => !needle || norm([c.full_name, c.phone, c.email].filter(Boolean).join(" ")).includes(needle));
  return (
    <section className="flex flex-col gap-5">
      <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Clientes</h1>
      <div className="max-w-[560px]">
        <SearchField placeholder="Nombre, celular o correo" defaultValue={q} />
      </div>
      {rows.length === 0 ? (
        <EmptyState title={q ? "No encontramos clientes con esa búsqueda" : "Aún no hay clientes"} text={q ? "Prueba con otro nombre, celular o correo." : "Los clientes aparecen aquí cuando se registran o se crea un ticket para ellos."} />
      ) : (
        <ul className="m-0 grid list-none grid-cols-1 gap-3 p-0 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((c) => {
            const eq = total(c.equipment);
            const tk = total(c.tickets);
            return (
              <li key={c.id}>
                <Link href={`/b/tickets?estado=all&q=${encodeURIComponent(c.full_name)}`} className="press flex min-h-[84px] items-center gap-3.5 rounded-card border border-line bg-white p-4 text-ink no-underline shadow-card">
                  <Avatar name={c.full_name} size={46} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[16px] font-extrabold">{c.full_name}</span>
                    <span className="truncate text-[13px] font-semibold text-muted">
                      {[c.phone, `${eq} ${eq === 1 ? "equipo" : "equipos"}`, `${tk} ${tk === 1 ? "ticket" : "tickets"}`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <NavIcon name="chevron" width={18} height={18} aria-hidden className="flex-none" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
