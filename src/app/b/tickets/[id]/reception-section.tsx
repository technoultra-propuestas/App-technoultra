import Image from "next/image";
import { Card } from "@/components/ui/layout";
import { privateUrl } from "@/lib/cloudinary";
import { PHOTO_SLOTS, receptionPhotoStatus } from "@/lib/domain/reception";
import { createClient } from "@/lib/supabase/server";
import { removeEvidenceAction } from "../evidence-actions";
import { ReceptionPanel, type ReceptionPhoto } from "./reception-panel";
import { AssistedSignature, ExceptionForm } from "./acta-forms";
import { GenerateDocForm } from "./document-forms";

type Ev = { id: string; slot: string | null; media_kind: string; cloudinary_public_id: string; format: string | null };

/** Muestra miniaturas con URLs firmadas y temporales (≤ 1 h). Si Cloudinary no está configurado, degrada sin romper. */
function signed(e: Ev): string | null {
  try {
    return privateUrl(e.cloudinary_public_id, e.format ?? "jpg", e.media_kind === "video" ? "video" : "image");
  } catch {
    return null;
  }
}

export async function EvidenceGallery({ items, ticketId, canRemove }: { items: Ev[]; ticketId: string; canRemove: boolean }) {
  if (items.length === 0) return <p className="m-0 text-[14px] text-muted">Sin archivos todavía.</p>;
  return (
    <ul className="m-0 grid list-none grid-cols-[repeat(auto-fill,minmax(110px,1fr))] gap-2 p-0">
      {items.map((e) => {
        const url = signed(e);
        return (
          <li key={e.id} className="flex flex-col gap-1">
            <div className="relative aspect-square overflow-hidden rounded-[12px] border border-line bg-[#EDEDEA]">
              {url && e.media_kind === "photo" ? (
                <Image src={url} alt={e.slot ?? "Evidencia"} fill unoptimized sizes="120px" className="object-cover" />
              ) : url ? (
                <a href={url} target="_blank" rel="noreferrer" className="flex h-full items-center justify-center text-[13px] font-extrabold">
                  Ver video
                </a>
              ) : null}
            </div>
            <div className="flex items-center justify-between gap-1 text-[11px] font-bold text-muted">
              <span>{PHOTO_SLOTS.find((s) => s.slot === e.slot)?.label ?? "Otro"}</span>
              {canRemove ? (
                <form action={removeEvidenceAction}>
                  <input type="hidden" name="ticketId" value={ticketId} />
                  <input type="hidden" name="evidenceId" value={e.id} />
                  <button type="submit" className="text-[#9A2B1E] underline">
                    Quitar
                  </button>
                </form>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export async function ReceptionSection({ ticketId, problem, open, role, customer }: { ticketId: string; problem: string; open: boolean; role: "technician" | "superadmin"; customer: string }) {
  const supabase = await createClient();
  const [{ data: reception }, { data: evidence }] = await Promise.all([
    supabase.from("receptions").select("reason, accessories, visible_damage, physical_condition, observations, received_by, created_at").eq("ticket_id", ticketId).maybeSingle(),
    supabase.from("evidence").select("id, slot, media_kind, cloudinary_public_id, format, stage").eq("ticket_id", ticketId).eq("stage", "reception").is("deleted_at", null).order("created_at"),
  ]);
  const items = (evidence ?? []) as Ev[];
  const photos: ReceptionPhoto[] = items.filter((e) => e.media_kind === "photo").map((e) => ({ id: e.id, slot: e.slot, url: signed(e) }));
  const status = receptionPhotoStatus(items.map((e) => e.slot));
  const [{ data: actas }, { data: exception }] = await Promise.all([
    supabase.from("documents").select("id, code, version, status").eq("ticket_id", ticketId).eq("doc_type", "reception").order("version", { ascending: false }).limit(1),
    supabase.from("ticket_exceptions").select("reason, created_at").eq("ticket_id", ticketId).eq("kind", "reception_signature").maybeSingle(),
  ]);
  const acta = actas?.[0] ?? null;
  const { data: by } = reception?.received_by ? await supabase.from("profiles").select("full_name").eq("id", reception.received_by).maybeSingle() : { data: null };

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">Recepción del equipo</h2>
        <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${reception ? "bg-ok-soft text-ok" : status.complete ? "bg-[#FFF0DD] text-warn" : "bg-[#FBF1D9] text-[#6E4B00]"}`}>
          {reception ? "✓ Recepción confirmada" : status.complete ? "Fotos listas · falta confirmar" : `${status.done} de ${status.total} fotos`}
        </span>
      </div>
      <ReceptionPanel
        ticketId={ticketId}
        photos={photos}
        editable={open}
        defaultReason={problem}
        saved={reception ? { reason: reception.reason, accessories: reception.accessories ?? [], damage: reception.visible_damage ?? [], legacyCondition: reception.physical_condition ?? "", observations: reception.observations ?? "", by: by?.full_name ?? null, at: reception.created_at } : null}
      />
      {reception ? (
        <div className="flex flex-col gap-3 rounded-[14px] border border-line bg-white p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="m-0 text-[15px] font-extrabold">Acta de recepción</h3>
            <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${acta?.status === "signed" ? "bg-ok-soft text-ok" : "bg-[#FBF1D9] text-[#6E4B00]"}`}>
              {!acta ? "Pendiente de preparar" : acta.status === "signed" ? "✓ Firmada por el cliente" : exception ? "Excepción autorizada" : "Pendiente de firma"}
            </span>
          </div>
          {acta ? (
            <a href={`/documentos/${acta.id}`} target="_blank" rel="noreferrer" className="w-fit text-[14px] font-extrabold underline decoration-brand underline-offset-[3px]">
              {acta.status === "signed" ? "Abrir acta firmada (PDF)" : "Revisar acta (PDF)"} · v{acta.version}
            </a>
          ) : (
            <GenerateDocForm ticketId={ticketId} kind="reception" label="Generar acta" />
          )}
          {acta && acta.status !== "signed" ? (
            <>
              <p className="m-0 text-[13px] text-muted">El cliente debe firmar el acta antes de pasar a diagnóstico: desde su sesión (recibió el aviso) o aquí, dibujando él mismo su firma.</p>
              <AssistedSignature documentId={acta.id} code={acta.code} customer={customer} />
              {role === "superadmin" && !exception ? (
                <details className="rounded-[12px] border border-line bg-[#F6F6F5] p-3">
                  <summary className="cursor-pointer text-[13px] font-extrabold">Continuar sin la firma (solo administración)</summary>
                  <div className="mt-2">
                    <ExceptionForm ticketId={ticketId} />
                  </div>
                </details>
              ) : null}
            </>
          ) : null}
          {exception ? <p className="m-0 text-[13px] text-muted">Excepción autorizada: {exception.reason}</p> : null}
        </div>
      ) : null}
    </Card>
  );
}
