"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { registerEvidenceAction, signUploadAction } from "../evidence-actions";

const IMAGE_MAX = 15 * 1024 * 1024;
const VIDEO_MAX = 100 * 1024 * 1024;
const OK_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif"];
const OK_VIDEO = ["video/mp4", "video/quicktime", "video/webm"];

type Props = { ticketId: string; stage: string; slot?: string; label: string; done?: boolean; allowVideo?: boolean };

/** Sube directo a Cloudinary con una firma de un solo uso emitida por el servidor; luego el servidor verifica y registra. */
export function EvidenceUploader({ ticketId, stage, slot, label, done = false, allowVideo = false }: Props) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<"idle" | "uploading" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function onFile(file: File | undefined) {
    if (!file) return;
    const isVideo = OK_VIDEO.includes(file.type);
    const isImage = OK_IMAGE.includes(file.type);
    if (!isImage && !(allowVideo && isVideo)) return fail("Formato no permitido. Usa JPG, PNG, WEBP o HEIC" + (allowVideo ? " (o MP4/MOV/WEBM)." : "."));
    if (file.size > (isVideo ? VIDEO_MAX : IMAGE_MAX)) return fail("El archivo es demasiado grande.");
    setState("uploading");
    setMsg("");
    const sig = await signUploadAction({ ticketId, stage, slot: slot ?? null });
    if (!sig.ok) return fail(sig.error);
    const resourceType = isVideo ? "video" : "image";
    const body = new FormData();
    body.set("file", file);
    body.set("api_key", sig.apiKey);
    body.set("signature", sig.signature);
    for (const [k, v] of Object.entries(sig.params)) body.set(k, String(v));
    try {
      const res = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloudName}/${resourceType}/upload`, { method: "POST", body });
      if (!res.ok) return fail("No se pudo subir el archivo. Inténtalo de nuevo.");
    } catch {
      return fail("Sin conexión. Inténtalo de nuevo.");
    }
    const reg = await registerEvidenceAction({ ticketId, stage, slot: slot ?? null, publicId: sig.publicId, resourceType });
    if (!reg.ok) return fail(reg.error ?? "No pudimos registrar el archivo.");
    setState("idle");
    if (input.current) input.current.value = "";
    router.refresh();
    navigator.vibrate?.(15);
  }
  function fail(m: string) {
    setState("error");
    setMsg(m);
    navigator.vibrate?.([30, 40, 30]);
  }

  return (
    <div className="flex flex-col gap-1">
      <button
        type="button"
        disabled={state === "uploading"}
        onClick={() => input.current?.click()}
        className={`flex min-h-12 items-center justify-between gap-2 rounded-[14px] border-[1.5px] px-4 text-left text-[14px] font-extrabold disabled:opacity-60 ${
          done ? "border-[#1F6B3A] bg-[#E3F3E8] text-[#1F6B3A]" : "border-line-strong bg-white text-ink"
        }`}
      >
        <span>{label}</span>
        <span aria-hidden>{state === "uploading" ? "Subiendo…" : done ? "✓" : "＋"}</span>
      </button>
      <input
        ref={input}
        type="file"
        hidden
        accept={allowVideo ? "image/*,video/*" : "image/*"}
        capture="environment"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      {state === "error" ? (
        <span role="alert" className="text-[12px] font-bold text-[#9A2B1E]">
          {msg}
        </span>
      ) : null}
    </div>
  );
}
