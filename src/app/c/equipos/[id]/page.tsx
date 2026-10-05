import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Card, fmtDate, PageTitle, StatusBadge } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { archiveEquipmentAction } from "../actions";
import { EquipmentForm } from "../equipment-form";

export const metadata: Metadata = { title: "Equipo", robots: { index: false } };

export default async function EquipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["client"]);
  const id = z
    .string()
    .uuid()
    .safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  // RLS: un id ajeno devuelve 0 filas → 404 (no revela si existe).
  const { data: eq } = await supabase
    .from("equipment")
    .select("*")
    .eq("id", id.data)
    .is("deleted_at", null)
    .maybeSingle();
  if (!eq) notFound();
  const [{ data: tickets }, { data: history }] = await Promise.all([
    supabase
      .from("tickets")
      .select("id, code, status, created_at")
      .eq("equipment_id", eq.id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("equipment_history")
      .select("id, event_type, created_at")
      .eq("equipment_id", eq.id)
      .order("created_at", { ascending: false })
      .limit(20),
  ]);
  return (
    <section className="grid gap-6 md:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-6">
        <PageTitle title={`${eq.brand} ${eq.model}`} />
        <Card>
          <EquipmentForm values={eq} />
        </Card>
        <form action={archiveEquipmentAction}>
          <input type="hidden" name="id" value={eq.id} />
          <button
            type="submit"
            className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold text-[#9A2B1E]"
          >
            Quitar de mi lista
          </button>
        </form>
      </div>
      <aside className="flex flex-col gap-4">
        <Card className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Servicios de este equipo</h2>
          {(tickets ?? []).length === 0 ? (
            <p className="m-0 text-[14px] text-muted">Todavía no tiene servicios.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-2 p-0">
              {(tickets ?? []).map((t) => (
                <li key={t.id} className="flex items-center justify-between gap-2">
                  <Link
                    href={`/c/tickets/${t.id}`}
                    className="text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]"
                  >
                    {t.code}
                  </Link>
                  <StatusBadge status={t.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>
        {eq.next_maintenance_at ? (
          <Card>
            <div className="text-[13px] font-bold text-muted">Próximo mantenimiento recomendado</div>
            <div className="text-[18px] font-extrabold">{fmtDate(eq.next_maintenance_at)}</div>
          </Card>
        ) : null}
        {(history ?? []).length > 0 ? (
          <Card className="flex flex-col gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">Historial</h2>
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[14px] font-semibold">
              {(history ?? []).map((h) => (
                <li key={h.id} className="flex justify-between gap-2">
                  <span>{h.event_type === "delivered" ? "Entregado tras servicio" : h.event_type}</span>
                  <span className="text-muted">{fmtDate(h.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
      </aside>
    </section>
  );
}
