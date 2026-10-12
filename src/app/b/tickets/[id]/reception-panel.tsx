"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useRef, useState } from "react";
import { FormDraft } from "@/components/forms/FormDraft";
import { IconCamera, IconCheck, IconImage, IconRefresh } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/layout";
import { initialState } from "@/lib/auth/schemas";
import { ACCESSORIES, DAMAGES, PHOTO_SLOTS, receptionPhotoStatus } from "@/lib/domain/reception";
import { removeEvidenceAction } from "../evidence-actions";
import { saveReceptionAction } from "../reception-actions";
import { uploadEvidenceFile } from "./evidence-uploader";

export type ReceptionPhoto = { id: string; slot: string | null; url: string | null };
export type ReceptionSaved = { reason: string; accessories: string[]; damage: string[]; legacyCondition: string; observations: string; by: string | null; at: string };

type SlotState = { status: "idle" | "uploading" | "error"; msg: string; file: File | null };

const fmt = new Intl.DateTimeFormat("es-CO", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "America/Bogota" });

/** Ficha de UNA fotografía: miniatura, estado, cámara, galería, ampliar, cambiar, quitar y reintentar sin tocar las demás. */
function PhotoCard({ ticketId, slot, label, required, photos, editable, onZoom }: { ticketId: string; slot: string; label: string; required: boolean; photos: ReceptionPhoto[]; editable: boolean; onZoom: (url: string) => void }) {
  const router = useRouter();
  const cam = useRef<HTMLInputElement>(null);
  const gal = useRef<HTMLInputElement>(null);
  const [st, setSt] = useState<SlotState>({ status: "idle", msg: "", file: null });
  const photo = photos[photos.length - 1] ?? null; // la más reciente
  const done = Boolean(photo);

  async function upload(file: File) {
    setSt({ status: "uploading", msg: "", file });
    const r = await uploadEvidenceFile(file, { ticketId, stage: "reception", slot });
    if (!r.ok) {
      setSt({ status: "error", msg: r.error, file });
      navigator.vibrate?.([30, 40, 30]);
      return;
    }
    // Cambiar una foto = subir la nueva y retirar la anterior (si la subió esta misma persona; si no, queda como adicional).
    for (const old of photos) {
      const fd = new FormData();
      fd.set("ticketId", ticketId);
      fd.set("evidenceId", old.id);
      await removeEvidenceAction(fd);
    }
    setSt({ status: "idle", msg: "", file: null });
    navigator.vibrate?.(15);
    router.refresh();
  }
  const pick = (f: File | undefined, input: HTMLInputElement | null) => {
    if (f) void upload(f);
    if (input) input.value = "";
  };
  async function remove() {
    if (!photo) return;
    const fd = new FormData();
    fd.set("ticketId", ticketId);
    fd.set("evidenceId", photo.id);
    await removeEvidenceAction(fd);
    router.refresh();
  }

  return (
    <li data-slot={slot} data-done={done ? "1" : "0"} className={`flex flex-col gap-2 rounded-[16px] border-[1.5px] p-2.5 ${done ? "border-[#9FD0B0] bg-ok-soft" : st.status === "error" ? "border-[#E5B3AC] bg-danger-soft" : "border-line-strong bg-white"}`}>
      <div className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-[12px] bg-paper">
        {photo?.url ? (
          <button type="button" onClick={() => onZoom(photo.url!)} aria-label={`Ampliar la foto: ${label}`} className="absolute inset-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={photo.url} alt={label} loading="lazy" className="h-full w-full object-cover" />
          </button>
        ) : (
          <IconCamera aria-hidden width={34} height={34} className={st.status === "uploading" ? "animate-pulse text-brand" : "text-muted"} />
        )}
        {done ? (
          <span aria-hidden className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-ok text-white">
            <IconCheck width={14} height={14} strokeWidth={3.5} />
          </span>
        ) : null}
        {st.status === "uploading" ? <span role="status" className="absolute inset-x-0 bottom-0 bg-ink/80 py-1 text-center text-[12px] font-extrabold text-white">Subiendo…</span> : null}
      </div>
      <div className="flex flex-col">
        <span className="text-[13.5px] font-extrabold leading-tight">{label}{required ? " *" : ""}</span>
        <span className={`text-[12px] font-bold ${done ? "text-ok" : st.status === "error" ? "text-danger" : "text-muted"}`}>
          {st.status === "uploading" ? "Subiendo…" : st.status === "error" ? "No se subió" : done ? "Foto lista" : required ? "Falta esta foto" : "Opcional"}
        </span>
      </div>
      {st.status === "error" ? (
        <div className="flex flex-col gap-1.5">
          <p role="alert" className="m-0 text-[12px] font-bold text-danger">{st.msg}</p>
          {st.file ? (
            <button type="button" onClick={() => void upload(st.file!)} className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] bg-ink px-3 text-[13px] font-extrabold text-white">
              <IconRefresh width={16} height={16} /> Reintentar
            </button>
          ) : null}
        </div>
      ) : null}
      {editable && st.status !== "uploading" ? (
        <div className="grid grid-cols-2 gap-1.5">
          <button type="button" onClick={() => cam.current?.click()} aria-label={`${done ? "Cambiar" : "Tomar"} foto con la cámara: ${label}`} className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-line-strong bg-white px-2 text-[12.5px] font-extrabold">
            <IconCamera width={16} height={16} /> {done ? "Cambiar" : "Cámara"}
          </button>
          <button type="button" onClick={() => gal.current?.click()} aria-label={`Elegir de la galería o del equipo: ${label}`} className="press inline-flex min-h-11 items-center justify-center gap-1.5 rounded-[12px] border-[1.5px] border-line-strong bg-white px-2 text-[12.5px] font-extrabold">
            <IconImage width={16} height={16} /> Galería
          </button>
          {done ? (
            <button type="button" onClick={() => void remove()} className="col-span-2 min-h-9 text-[12.5px] font-bold text-danger underline">
              Quitar foto
            </button>
          ) : null}
        </div>
      ) : null}
      {editable ? (
        <>
          <input ref={cam} type="file" hidden accept="image/*" capture="environment" onChange={(e) => pick(e.target.files?.[0], cam.current)} />
          <input ref={gal} type="file" hidden accept="image/*" onChange={(e) => pick(e.target.files?.[0], gal.current)} />
        </>
      ) : null}
    </li>
  );
}

function Chip({ children, tone = "neutral" }: { children: React.ReactNode; tone?: "neutral" | "warn" }) {
  return <span className={`rounded-full px-2.5 py-1 text-[12.5px] font-bold ${tone === "warn" ? "bg-[#FDE8E4] text-danger" : "bg-paper text-ink"}`}>{children}</span>;
}

/**
 * Recepción del equipo: FOTOGRAFÍAS PRIMERO (se suben directo al ticket, sin guardar nada antes), después el acta (motivo, accesorios, estado
 * del equipo) y «Confirmar recepción» con resumen. Las fotos ya subidas sobreviven a recargas y a fallos de red; lo escrito en el formulario
 * se conserva como borrador del navegador hasta confirmar.
 */
export function ReceptionPanel({ ticketId, photos, saved, defaultReason, editable }: { ticketId: string; photos: ReceptionPhoto[]; saved: ReceptionSaved | null; defaultReason: string; editable: boolean }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(saveReceptionAction, initialState);
  const [editing, setEditing] = useState(false);
  const [zoom, setZoom] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const [snap, setSnap] = useState<{ damage: string[]; acc: string[]; hasText: boolean }>({ damage: saved?.damage ?? [], acc: saved?.accessories ?? [], hasText: Boolean(saved?.observations) });

  const status = receptionPhotoStatus(photos.map((p) => p.slot));
  const bySlot = (slot: string) => photos.filter((p) => p.slot === slot);
  const extras = PHOTO_SLOTS.filter((p) => !p.required);
  const extraPhotos = photos.filter((p) => extras.some((x) => x.slot === p.slot));

  useEffect(() => {
    if (zoom) dialog.current?.showModal();
  }, [zoom]);
  useEffect(() => {
    if (state.ok) {
      const t = setTimeout(() => {
        setEditing(false);
        router.refresh();
      }, 0);
      return () => clearTimeout(t);
    }
  }, [state.ok, router]);

  function readForm() {
    const f = form.current;
    if (!f) return;
    const fd = new FormData(f);
    setSnap({ damage: fd.getAll("damage").map(String), acc: fd.getAll("accessories").map(String), hasText: String(fd.get("observations") ?? "").trim().length > 0 });
  }
  useEffect(() => {
    // el borrador restaurado dispara eventos de cambio; también se lee al montar
    const t = setTimeout(readForm, 600);
    return () => clearTimeout(t);
  }, []);

  const showForm = editable && (!saved || editing);
  const missing = status.total - status.done;
  const pct = Math.round((status.done / status.total) * 100);

  const group = (name: string, label: string, options: string[], selected: string[]) => (
    <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
      <legend className="mb-2 text-[15px] font-extrabold">{label}</legend>
      <div className="grid grid-cols-1 gap-x-3 gap-y-0.5 sm:grid-cols-2">
        {options.map((o) => (
          <label key={o} className="flex min-h-11 items-center gap-2.5 text-[14.5px] font-semibold">
            <input type="checkbox" name={name} value={o} defaultChecked={selected.includes(o)} className="h-5 w-5 accent-[#FF8A00]" />
            {o}
          </label>
        ))}
      </div>
    </fieldset>
  );

  return (
    <div className="flex flex-col gap-5">
      {/* 1 · FOTOGRAFÍAS */}
      <section id="fotos-recepcion" aria-label="Fotografías del equipo" className="flex scroll-mt-24 flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="m-0 text-[16px] font-extrabold">Fotografías del equipo</h3>
          <span role="status" className={`rounded-full px-3 py-1 text-[13px] font-extrabold ${status.complete ? "bg-ok-soft text-ok" : "bg-[#FFF0DD] text-warn"}`}>
            {status.done} de {status.total} fotos
          </span>
        </div>
        <div aria-hidden className="h-2 w-full overflow-hidden rounded-full bg-line">
          <div className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${status.complete ? "bg-ok" : "bg-brand"}`} style={{ width: `${pct}%` }} />
        </div>
        <ul className="m-0 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
          {PHOTO_SLOTS.filter((p) => p.required).map((p) => (
            <PhotoCard key={p.slot} ticketId={ticketId} slot={p.slot} label={p.label} required photos={bySlot(p.slot)} editable={editable} onZoom={setZoom} />
          ))}
        </ul>
        <details className="group rounded-[14px] border border-line bg-paper px-3.5 py-1">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-[14px] font-extrabold [&::-webkit-details-marker]:hidden">
            Fotos adicionales (opcional){extraPhotos.length ? ` · ${extraPhotos.length}` : ""}
            <span aria-hidden className="text-muted transition-transform duration-200 group-open:rotate-180 motion-reduce:transition-none">▾</span>
          </summary>
          <ul className="m-0 mb-3 grid list-none grid-cols-2 gap-3 p-0 lg:grid-cols-4">
            {extras.map((p) => (
              <PhotoCard key={p.slot} ticketId={ticketId} slot={p.slot} label={p.label} required={false} photos={bySlot(p.slot)} editable={editable} onZoom={setZoom} />
            ))}
          </ul>
        </details>
      </section>

      {/* 2 · ACTA */}
      {showForm ? (
        <form ref={form} action={action} onChange={readForm} className="flex flex-col gap-5" noValidate>
          <FormDraft id={`recepcion-${ticketId}`} />
          <input type="hidden" name="ticketId" value={ticketId} />
          <Textarea label="Motivo de ingreso" name="reason" defaultValue={saved?.reason ?? defaultReason} required error={state.fieldErrors?.reason} rows={3} />
          {group("accessories", "Accesorios recibidos", ACCESSORIES, saved?.accessories ?? [])}
          <section aria-label="Estado del equipo al recibirlo" className="flex flex-col gap-3 rounded-card border border-line p-4">
            <h3 className="m-0 text-[16px] font-extrabold">Estado del equipo al recibirlo</h3>
            {group("damage", "Daños visibles", DAMAGES, saved?.damage ?? [])}
            {saved?.legacyCondition ? <p className="m-0 rounded-[12px] bg-paper p-3 text-[13px] text-ink-2"><strong>Estado físico anotado antes:</strong> {saved.legacyCondition}</p> : null}
            <Textarea label="Otros daños, detalles o condiciones importantes (opcional)" name="observations" defaultValue={saved?.observations ?? ""} error={state.fieldErrors?.observations} rows={3} />
          </section>

          {/* 3 · RESUMEN + CONFIRMAR */}
          <section aria-label="Resumen de la recepción" className="flex flex-col gap-2 rounded-card bg-paper p-4">
            <h3 className="m-0 text-[15px] font-extrabold">Resumen</h3>
            <div className="flex flex-wrap gap-1.5">
              <Chip tone={status.complete ? "neutral" : "warn"}>📷 {status.done} de {status.total} fotos</Chip>
              {snap.damage.length ? snap.damage.map((d) => <Chip key={d}>{d}</Chip>) : <Chip>Sin daños marcados</Chip>}
            </div>
            <p className="m-0 text-[13.5px] text-ink-2">
              <strong>Accesorios:</strong> {snap.acc.length ? snap.acc.join(", ") : "ninguno"}
              {snap.damage.includes("Otros daños") && !snap.hasText ? <span className="font-bold text-danger"> · Describe los otros daños en los detalles.</span> : null}
            </p>
          </section>
          {state.error && !state.fieldErrors ? <p role="alert" className="m-0 rounded-[12px] bg-danger-soft p-3 text-[14px] font-bold text-danger">{state.error}</p> : null}
          {state.ok && state.message ? <p role="status" className="m-0 rounded-[12px] bg-ok-soft p-3 text-[14px] font-bold text-ok">{state.message}</p> : null}
          {!saved && !status.complete ? (
            <div className="flex flex-col gap-2 rounded-[14px] bg-[#FFF0DD] p-3.5">
              <p className="m-0 text-[14px] font-extrabold text-warn">
                Faltan {missing} foto{missing === 1 ? "" : "s"} obligatoria{missing === 1 ? "" : "s"}: {status.missingLabels.join(", ")}.
              </p>
              <a href="#fotos-recepcion" className="w-fit min-h-11 content-center text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">Ir a las fotografías</a>
            </div>
          ) : null}
          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={pending || (!saved && !status.complete)} className="press min-h-[52px] flex-1 rounded-2xl bg-brand px-6 text-[16px] font-extrabold text-ink disabled:opacity-50 sm:flex-none">
              {pending ? "Guardando…" : saved ? "Guardar cambios" : "Confirmar recepción"}
            </button>
            <span className="text-[13px] font-bold text-muted">{status.done} de {status.total} fotos</span>
            {saved ? (
              <button type="button" onClick={() => setEditing(false)} className="min-h-11 text-[14px] font-bold text-muted underline">Cancelar</button>
            ) : null}
          </div>
        </form>
      ) : saved ? (
        <section aria-label="Recepción confirmada" className="flex flex-col gap-3 rounded-card border border-[#9FD0B0] bg-ok-soft p-4">
          <p className="m-0 flex items-center gap-2 text-[16px] font-extrabold text-ok"><IconCheck width={20} height={20} strokeWidth={3} /> Recepción confirmada</p>
          <p className="m-0 text-[13px] font-semibold text-ink-2">{saved.by ? `Registrada por ${saved.by}` : "Registrada"} · {fmt.format(new Date(saved.at))}</p>
          <dl className="m-0 grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[14px]">
            <dt className="font-semibold text-muted">Motivo</dt><dd className="m-0 font-bold">{saved.reason}</dd>
            <dt className="font-semibold text-muted">Accesorios</dt><dd className="m-0 font-bold">{saved.accessories.length ? saved.accessories.join(", ") : "Ninguno"}</dd>
            <dt className="font-semibold text-muted">Daños</dt><dd className="m-0 font-bold">{saved.damage.length ? saved.damage.join(", ") : "Ninguno reportado"}</dd>
            {saved.legacyCondition ? (<><dt className="font-semibold text-muted">Estado físico</dt><dd className="m-0 font-bold">{saved.legacyCondition}</dd></>) : null}
            {saved.observations ? (<><dt className="font-semibold text-muted">Detalles</dt><dd className="m-0 font-bold">{saved.observations}</dd></>) : null}
          </dl>
          {editable ? <button type="button" onClick={() => setEditing(true)} className="press min-h-11 w-fit rounded-[12px] border-[1.5px] border-line-strong bg-white px-4 text-[14px] font-extrabold">Editar recepción</button> : null}
        </section>
      ) : null}

      <dialog ref={dialog} onClose={() => setZoom(null)} onClick={(e) => e.target === dialog.current && dialog.current?.close()} className="m-auto max-h-[92vh] max-w-[min(92vw,900px)] rounded-card border-0 bg-ink p-2 backdrop:bg-black/70">
        {zoom ? (
          <div className="flex flex-col gap-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={zoom} alt="Fotografía ampliada" className="max-h-[80vh] w-full rounded-[12px] object-contain" />
            <button type="button" onClick={() => dialog.current?.close()} className="press min-h-11 rounded-[12px] bg-white px-4 text-[14px] font-extrabold text-ink">Cerrar</button>
          </div>
        ) : null}
      </dialog>
    </div>
  );
}
