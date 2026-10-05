import "server-only";
import { createHash } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

export const IMAGE_FORMATS = ["jpg", "jpeg", "png", "webp", "heic", "heif"] as const;
export const VIDEO_FORMATS = ["mp4", "mov", "webm"] as const;
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_VIDEO_BYTES = 100 * 1024 * 1024;

/** Firma de Cloudinary: SHA-1 de los parámetros ordenados (sin file/cloud_name/resource_type/api_key) + secreto. */
export function signParams(params: Record<string, string | number | undefined>, apiSecret: string): string {
  const toSign = Object.entries(params)
    .filter(([k, v]) => v !== undefined && v !== "" && !["file", "cloud_name", "resource_type", "api_key"].includes(k))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return createHash("sha1").update(toSign + apiSecret).digest("hex");
}

export const ticketFolder = (ticketId: string) => `technoultra/tickets/${ticketId}`;

/** Parámetros firmados para una subida directa desde el navegador. Los activos son PRIVADOS (type=authenticated). */
export function signedUpload(ticketId: string, stage: string, slot: string | null, now: number = Math.floor(Date.now() / 1000)) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = serverEnv.cloudinary();
  const publicId = `${stage}${slot ? `-${slot}` : ""}-${crypto.randomUUID()}`;
  const params = {
    folder: ticketFolder(ticketId),
    public_id: publicId,
    timestamp: now,
    type: "authenticated",
    allowed_formats: [...IMAGE_FORMATS, ...VIDEO_FORMATS].join(","),
  };
  return {
    cloudName: CLOUDINARY_CLOUD_NAME,
    apiKey: CLOUDINARY_API_KEY,
    params,
    signature: signParams(params, CLOUDINARY_API_SECRET),
    fullPublicId: `${params.folder}/${publicId}`,
  };
}

export type CloudinaryAsset = { public_id: string; resource_type: "image" | "video"; type: string; format: string; bytes: number };

/** Confirma en Cloudinary (API de administración) que el activo existe y cumple las reglas antes de registrarlo. */
export async function fetchAsset(publicId: string, resourceType: "image" | "video"): Promise<CloudinaryAsset | null> {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = serverEnv.cloudinary();
  const auth = Buffer.from(`${CLOUDINARY_API_KEY}:${CLOUDINARY_API_SECRET}`).toString("base64");
  const url = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/resources/${resourceType}/authenticated/${encodeURI(publicId)}`;
  try {
    const res = await fetch(url, { headers: { Authorization: `Basic ${auth}` }, signal: AbortSignal.timeout(10_000) });
    if (!res.ok) return null;
    return (await res.json()) as CloudinaryAsset;
  } catch {
    return null;
  }
}

/** Reglas de aceptación de un activo subido (ownership por carpeta, formato real y tamaño). */
export function validateAsset(a: CloudinaryAsset, ticketId: string): { ok: true } | { ok: false; reason: string } {
  if (!a.public_id.startsWith(`${ticketFolder(ticketId)}/`)) return { ok: false, reason: "wrong_ticket" };
  if (a.type !== "authenticated") return { ok: false, reason: "not_private" };
  const fmt = a.format?.toLowerCase();
  if (a.resource_type === "image") {
    if (!(IMAGE_FORMATS as readonly string[]).includes(fmt)) return { ok: false, reason: "format" };
    if (a.bytes > MAX_IMAGE_BYTES) return { ok: false, reason: "size" };
  } else if (a.resource_type === "video") {
    if (!(VIDEO_FORMATS as readonly string[]).includes(fmt)) return { ok: false, reason: "format" };
    if (a.bytes > MAX_VIDEO_BYTES) return { ok: false, reason: "size" };
  } else return { ok: false, reason: "type" };
  return { ok: true };
}

/** URL de descarga firmada y temporal (≤ 1 h) para un activo privado. */
export function privateUrl(publicId: string, format: string, resourceType: "image" | "video", ttlSeconds = 3600, now: number = Math.floor(Date.now() / 1000)) {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = serverEnv.cloudinary();
  const params = { expires_at: now + Math.min(ttlSeconds, 3600), format, public_id: publicId, timestamp: now, type: "authenticated" };
  const signature = signParams(params, CLOUDINARY_API_SECRET);
  const qs = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])), signature, api_key: CLOUDINARY_API_KEY });
  return `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/${resourceType}/download?${qs}`;
}
