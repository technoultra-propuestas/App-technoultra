import type { Metadata } from "next";
import Link from "next/link";
import { Panel } from "@/components/ui/detail";
import { ListRow } from "@/components/ui/kit";
import { WHATSAPP_DISPLAY } from "@/lib/catalog/config";
import { whatsappUrl } from "@/lib/catalog/whatsapp";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Ayuda", robots: { index: false } };

const CATEGORY: Record<string, string> = {
  servicios: "Servicios",
  precios: "Precios",
  cobertura: "Cobertura y entregas",
  pagos: "Pagos",
  tickets: "Tu servicio",
  cotizaciones: "Cotizaciones",
  documentos: "Documentos y firma",
  garantia: "Garantía",
  mantenimiento: "Mantenimiento",
  tienda: "Shop",
  ayuda: "Ayuda",
  general: "General",
};

/** Centro de ayuda del cliente: asistente, preguntas frecuentes publicadas (sin datos dinámicos), contacto y seguimiento público. */
export default async function HelpPage() {
  await requireRole(["client"]);
  const supabase = await createClient();
  // Solo contenido PUBLICADO (RLS) y sin plantillas dinámicas ({price}, {cities}…): esas preguntas las responde el asistente con datos al día.
  const { data } = await supabase.from("knowledge_entries").select("id, category, question, answer, priority").eq("status", "published").not("answer", "like", "%{%").order("priority", { ascending: false }).limit(60);
  const groups = new Map<string, { id: string; question: string; answer: string }[]>();
  for (const e of data ?? []) groups.set(e.category, [...(groups.get(e.category) ?? []), { id: e.id, question: e.question, answer: e.answer }]);
  const help = whatsappUrl("Hola TechnoUltra 👋 Necesito ayuda con mi cuenta o mi servicio.");
  return (
    <section className="flex flex-col gap-5">
      <div>
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em] lg:text-[30px]">Ayuda</h1>
        <div className="mt-2 h-1 w-10 rounded-sm bg-brand" />
        <p className="m-0 mt-2 max-w-[640px] text-[15px] leading-normal text-muted">Respuestas rápidas, el asistente y cómo contactarnos.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Link href="/c/asistente" className="press flex min-h-[88px] flex-col justify-center gap-0.5 rounded-card border border-brand bg-white px-5 py-3 text-ink no-underline shadow-card">
          <span className="text-[16px] font-extrabold">Pregúntale al asistente</span>
          <span className="text-[13.5px] font-semibold text-muted">Servicios, precios y el estado de tu solicitud.</span>
        </Link>
        <a href={help} target="_blank" rel="noopener noreferrer" className="press flex min-h-[88px] flex-col justify-center gap-0.5 rounded-card bg-ink px-5 py-3 text-white no-underline shadow-card">
          <span className="text-[16px] font-extrabold">Escríbenos por WhatsApp</span>
          <span className="text-[13.5px] font-semibold text-[#D6D6D2]">{WHATSAPP_DISPLAY}</span>
        </a>
      </div>
      {groups.size === 0 ? (
        <Panel title="Preguntas frecuentes">
          <p className="m-0 text-[14px] text-muted">Pronto verás aquí las preguntas más comunes. Mientras tanto, el asistente puede ayudarte.</p>
        </Panel>
      ) : (
        [...groups.entries()].map(([cat, items]) => (
          <Panel key={cat} title={CATEGORY[cat] ?? cat}>
            <div className="flex flex-col divide-y divide-line">
              {items.map((q) => (
                <details key={q.id} className="group py-1">
                  <summary className="flex min-h-12 cursor-pointer items-center justify-between gap-3 text-[15px] font-extrabold">
                    {q.question}
                    <span aria-hidden className="flex-none text-brand transition-transform duration-200 group-open:rotate-45">+</span>
                  </summary>
                  <p className="m-0 whitespace-pre-line pb-3 text-[14.5px] leading-normal text-ink-2">{q.answer}</p>
                </details>
              ))}
            </div>
          </Panel>
        ))
      )}
      <div className="rounded-card border border-line bg-white p-2 shadow-card">
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
          <li><ListRow href="/seguimiento" title="Seguimiento de un servicio" detail="Consulta un ticket con su código, sin iniciar sesión" icon="ticket" tone="neutral" /></li>
          <li><ListRow href="/soporte-remoto" title="Soporte remoto" detail="Asistencia técnica desde tu casa, en toda Colombia" icon="wrench" tone="neutral" /></li>
          <li><ListRow href="/legal" title="Documentos y políticas" detail="Términos, privacidad, garantías y reembolsos" icon="shield" tone="neutral" /></li>
        </ul>
      </div>
    </section>
  );
}
