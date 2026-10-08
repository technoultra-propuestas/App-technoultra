import { staffNextAction } from "@/lib/domain/next-action";
import { loadFlowFacts } from "@/lib/tickets/facts";

/** «Próxima acción»: una sola cosa para hacer ahora (o la indicación de que toca esperar). */
export async function NextActionPanel({ ticketId }: { ticketId: string }) {
  const facts = await loadFlowFacts(ticketId);
  if (!facts) return null;
  const n = staffNextAction(facts);
  return (
    <section aria-label="Próxima acción" className={`flex flex-col gap-2 rounded-card p-5 ${n.waiting ? "border border-line bg-white" : "bg-ink text-white shadow-card"}`}>
      <span className={`text-[12px] font-extrabold uppercase tracking-[0.06em] ${n.waiting ? "text-muted" : "text-brand"}`}>{n.waiting ? "Ahora" : "Próxima acción"}</span>
      <h2 className="m-0 text-[20px] font-extrabold leading-tight">{n.title}</h2>
      <p className={`m-0 text-[14.5px] leading-snug ${n.waiting ? "text-ink-2" : "text-[#D6D6D2]"}`}>{n.body}</p>
      {n.cta ? (
        <a href={`#${n.cta.anchor}`} className={`mt-1 flex min-h-12 w-full items-center justify-center rounded-2xl px-5 text-[16px] font-extrabold no-underline sm:w-fit ${n.waiting ? "border-[1.5px] border-line-strong bg-white text-ink" : "bg-brand text-ink"}`}>
          {n.cta.label}
        </a>
      ) : null}
    </section>
  );
}
