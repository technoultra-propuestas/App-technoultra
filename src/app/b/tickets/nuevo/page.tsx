import type { Metadata } from "next";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { WalkinForm } from "./walkin-form";

export const metadata: Metadata = { title: "Nuevo ticket", robots: { index: false } };

export default async function NewTicketPage() {
  const profile = await requireRole(["technician", "superadmin"]);
  const supabase = await createClient();
  // RLS: el administrador ve a todos los clientes; el técnico solo puede crear clientes nuevos (no los busca).
  const isAdmin = profile.role === "superadmin";
  const [customers, equipment, services] = await Promise.all([
    isAdmin ? supabase.from("customers").select("id, full_name, phone").is("deleted_at", null).order("full_name").limit(500) : Promise.resolve({ data: [] as { id: string; full_name: string; phone: string | null }[] }),
    isAdmin ? supabase.from("equipment").select("id, customer_id, brand, model").is("deleted_at", null).limit(1000) : Promise.resolve({ data: [] as { id: string; customer_id: string; brand: string; model: string }[] }),
    supabase.from("services").select("id, name").eq("is_active", true).eq("kind", "technical").order("name"),
  ]);
  return (
    <section className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
      <PageTitle title="Nuevo ticket de mostrador" subtitle="Para clientes que llegan al local o llaman. El ticket nace en «Solicitud recibida» y queda asignado a ti; al registrar la recepción del equipo pasa a «Equipo recibido»." />
      <WalkinForm
        canSearch={isAdmin}
        customers={(customers.data ?? []).map((c) => ({ id: c.id, name: c.full_name, phone: c.phone }))}
        equipment={(equipment.data ?? []).map((e) => ({ id: e.id, customer_id: e.customer_id, label: `${e.brand} ${e.model}` }))}
        services={services.data ?? []}
      />
    </section>
  );
}
