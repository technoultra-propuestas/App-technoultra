const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
export const MAX_SIGNATURE_BYTES = 200 * 1024;
export const MIN_SIGNATURE_BYTES = 800; // un lienzo en blanco pesa mucho menos

/** Valida que el dato sea un PNG real (magic bytes) de tamaño razonable y no esté en blanco. Devuelve los bytes o null. */
export function decodePngDataUrl(dataUrl: string): Uint8Array | null {
  const prefix = "data:image/png;base64,";
  if (!dataUrl.startsWith(prefix)) return null;
  const b64 = dataUrl.slice(prefix.length);
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;
  const bytes = Uint8Array.from(Buffer.from(b64, "base64"));
  if (bytes.length < MIN_SIGNATURE_BYTES || bytes.length > MAX_SIGNATURE_BYTES) return null;
  if (!PNG_MAGIC.every((b, i) => bytes[i] === b)) return null;
  return bytes;
}
