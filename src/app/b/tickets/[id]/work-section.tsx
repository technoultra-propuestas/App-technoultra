import { Card } from "@/components/ui/layout";
import { createClient } from "@/lib/supabase/server";
import { setChecklistItemAction, startChecklistAction } from "../work-actions";
import { EvidenceUploader } from "./evidence-uploader";
import { EvidenceGallery } from "./reception-section";
import { CompleteChecklistForm, DeliveryForm, DiagnosisForm, FinalizeDiagnosisForm } from "./work-forms";

type Ev = { id: string; slot: string | null; media_kind: string; cloudinary_public_id: string; format: string | null };

const STATE_LABEL: Record<string, string> = { pending: "Pendiente", pass: "Aprobado", fail: "Falla", na: "No aplica" };

/** Panel de trabajo que cambia según el estado del ticket (diagnóstico → checklist → entrega). */
export async function WorkSection({ ticketId, status }: { ticketId: string; status: string }) {
  const supabase = await createClient();
  const showDiag = ["diagnosing", "awaiting_approval", "in_service", "awaiting_part", "testing"].includes(status);
  const showChecklist = ["in_service", "testing", "ready"].includes(status);
  const showDelivery = status === "ready";

  const [{ data: diag }, { data: run }] = await Promise.all([
    showDiag ? supabase.from("diagnostics").select("id, summary, tests_performed, recommendations, suggested_parts, visible_to_customer, finalized_at, updated_at").eq("ticket_id", ticketId).order("version", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    showChecklist ? supabase.from("checklist_runs").select("id, completed_at").eq("ticket_id", ticketId).order("created_at", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const { data: diagItems } = diag ? await supabase.from("diagnostic_items").select("component, state").eq("diagnostic_id", diag.id) : { data: [] as { component: string; state: string }[] };
  const { data: items } = run ? await supabase.from("checklist_items").select("id, label, is_required, state, note").eq("run_id", run.id).order("label") : { data: [] as { id: string; label: string; is_required: boolean; state: string; note: string | null }[] };
  const { data: settings } = showDelivery ? await supabase.from("app_settings").select("value").eq("key", "maintenance.default_months").maybeSingle() : { data: null };
  const { data: delivery } = showDelivery ? await supabase.from("deliveries").select("id, received_by_name").eq("ticket_id", ticketId).maybeSingle() : { data: null };
  const { data: deliveryEvidence } = showDelivery ? await supabase.from("evidence").select("id, slot, media_kind, cloudinary_public_id, format").eq("ticket_id", ticketId).eq("stage", "delivery").is("deleted_at", null) : { data: [] as Ev[] };
  const itemMap = Object.fromEntries((diagItems ?? []).map((i) => [i.component, i.state]));
  const pendingRequired = (items ?? []).filter((i) => i.is_required && ["pending", "fail"].includes(i.state)).length;

  return (
    <>
      {showDiag ? (
        <Card id="diagnostico" className="flex flex-col gap-3">
          <h2 className="m-0 text-[17px] font-extrabold">Diagnóstico técnico</h2>
          <DiagnosisForm ticketId={ticketId} defaults={{ summary: diag?.summary ?? "", tests: diag?.tests_performed ?? "", recommendations: diag?.recommendations ?? "", parts: diag?.suggested_parts ?? "", visible: diag?.visible_to_customer ?? false, items: itemMap }} />
          {diag?.summary && ["diagnosing", "awaiting_approval"].includes(status) ? <FinalizeDiagnosisForm ticketId={ticketId} reissue={Boolean(diag.finalized_at)} /> : null}
        </Card>
      ) : null}

      {showChecklist ? (
        <Card id="pruebas" className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="m-0 text-[17px] font-extrabold">Checklist de pruebas</h2>
            {run ? <span className="text-[12px] font-extrabold text-muted">{run.completed_at ? "Completado" : `${pendingRequired} obligatorias por resolver`}</span> : null}
          </div>
          {!run ? (
            status === "ready" ? (
              <p className="m-0 text-[14px] text-muted">No hay checklist registrado.</p>
            ) : (
              <form action={startChecklistAction}>
                <input type="hidden" name="ticketId" value={ticketId} />
                <button type="submit" className="min-h-12 w-full rounded-2xl bg-brand text-[16px] font-extrabold text-ink">
                  Iniciar checklist
                </button>
              </form>
            )
          ) : (
            <>
              <ul className="m-0 flex list-none flex-col gap-2 p-0">
                {(items ?? []).map((i) => (
                  <li key={i.id} className="flex items-center justify-between gap-2 border-b border-line pb-2 last:border-0">
                    <span className="text-[14px] font-semibold">
                      {i.label}
                      {i.is_required ? " *" : ""} <span className="text-[12px] text-muted">· {STATE_LABEL[i.state]}</span>
                    </span>
                    {!run.completed_at && status !== "ready" ? (
                      <div className="flex gap-1">
                        {(["pass", "fail", "na"] as const).map((s) => (
                          <form key={s} action={setChecklistItemAction}>
                            <input type="hidden" name="ticketId" value={ticketId} />
                            <input type="hidden" name="itemId" value={i.id} />
                            <input type="hidden" name="state" value={s} />
                            <button type="submit" aria-label={`${i.label}: ${STATE_LABEL[s]}`} aria-pressed={i.state === s} className={`min-h-9 rounded-[10px] border px-2.5 text-[12px] font-extrabold ${i.state === s ? "border-ink bg-ink text-white" : "border-line-strong bg-white"}`}>
                              {s === "pass" ? "OK" : s === "fail" ? "Falla" : "N/A"}
                            </button>
                          </form>
                        ))}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
              {!run.completed_at && status !== "ready" ? <CompleteChecklistForm ticketId={ticketId} runId={run.id} /> : null}
            </>
          )}
        </Card>
      ) : null}

      {showDelivery ? (
        <Card id="entrega" className="flex flex-col gap-4">
          <h2 className="m-0 text-[17px] font-extrabold">Entrega</h2>
          <div>
            <div className="mb-2 text-[15px] font-bold">Fotografías de entrega (DESPUÉS)</div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {["front", "screen", "other"].map((slot) => (
                <EvidenceUploader key={slot} ticketId={ticketId} stage="delivery" slot={slot} label={slot === "front" ? "Frontal" : slot === "screen" ? "Pantalla" : "Otra"} done={(deliveryEvidence ?? []).some((e) => e.slot === slot)} />
              ))}
            </div>
            <div className="mt-3">
              <EvidenceGallery items={(deliveryEvidence ?? []) as Ev[]} ticketId={ticketId} canRemove />
            </div>
          </div>
          {delivery ? (
            <p className="m-0 rounded-[14px] bg-[#E3F3E8] px-3 py-2 text-[14px] font-bold text-[#1F6B3A]">Entrega registrada · recibe {delivery.received_by_name}. Ya puedes pasar el ticket a «Entregado».</p>
          ) : (
            <DeliveryForm ticketId={ticketId} defaultMonths={Number((settings?.value as unknown) ?? 6) || 6} />
          )}
        </Card>
      ) : null}
    </>
  );
}
