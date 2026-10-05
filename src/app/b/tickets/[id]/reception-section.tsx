import Image from "next/image";
import { Card } from "@/components/ui/layout";
import { privateUrl } from "@/lib/cloudinary";
import { PHOTO_SLOTS } from "@/lib/domain/reception";
import { createClient } from "@/lib/supabase/server";
import { removeEvidenceAction } from "../evidence-actions";
import { EvidenceUploader } from "./evidence-uploader";
import { ReceptionForm } from "./reception-form";

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

export async function ReceptionSection({ ticketId, problem, open }: { ticketId: string; problem: string; open: boolean }) {
  const supabase = await createClient();
  const [{ data: reception }, { data: evidence }] = await Promise.all([
    supabase.from("receptions").select("reason, accessories, visible_damage, physical_condition, observations").eq("ticket_id", ticketId).maybeSingle(),
    supabase.from("evidence").select("id, slot, media_kind, cloudinary_public_id, format, stage").eq("ticket_id", ticketId).eq("stage", "reception").order("created_at"),
  ]);
  const items = (evidence ?? []) as Ev[];
  const have = new Set(items.map((e) => e.slot));
  const requiredDone = PHOTO_SLOTS.filter((s) => s.required && have.has(s.slot)).length;
  const requiredTotal = PHOTO_SLOTS.filter((s) => s.required).length;

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="m-0 text-[17px] font-extrabold">Recepción del equipo</h2>
        <span className={`rounded-full px-3 py-1 text-[12px] font-extrabold ${requiredDone === requiredTotal ? "bg-[#E3F3E8] text-[#1F6B3A]" : "bg-[#FBF1D9] text-[#6E4B00]"}`}>
          Fotos obligatorias {requiredDone}/{requiredTotal}
        </span>
      </div>
      {open ? <ReceptionForm ticketId={ticketId} defaults={{ reason: reception?.reason ?? problem, accessories: reception?.accessories ?? [], damage: reception?.visible_damage ?? [], physicalCondition: reception?.physical_condition ?? "", observations: reception?.observations ?? "" }} saved={Boolean(reception)} /> : null}
      {open && reception ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {PHOTO_SLOTS.map((s) => (
            <EvidenceUploader key={s.slot} ticketId={ticketId} stage="reception" slot={s.slot} label={`${s.label}${s.required ? " *" : ""}`} done={have.has(s.slot)} />
          ))}
        </div>
      ) : open ? (
        <p className="m-0 text-[13px] text-muted">Guarda la recepción para poder subir las fotografías.</p>
      ) : null}
      <EvidenceGallery items={items} ticketId={ticketId} canRemove={open} />
    </Card>
  );
}
