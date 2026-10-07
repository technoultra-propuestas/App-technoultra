/** Utilidades de texto del asistente: normalización, tokens y puntuación. Sin dependencias ni llamadas externas (0 tokens). */

export const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const STOP = new Set(["el", "la", "los", "las", "un", "una", "unos", "unas", "de", "del", "al", "y", "o", "u", "en", "a", "que", "por", "para", "con", "sin", "mi", "mis", "me", "te", "se", "es", "son", "su", "sus", "lo", "le", "les", "hay", "tengo", "quiero", "necesito", "como", "cual", "cuales", "esta", "este", "esto", "ese", "eso", "si", "no", "mas", "muy", "ya"]);

export const tokens = (s: string) => normalize(s).split(" ").filter((t) => t.length > 1 && !STOP.has(t));

/** Texto seguro para mostrar al cliente: sin HTML, sin enlaces ni Markdown de enlaces, longitud acotada. */
export function sanitizeReply(input: string, max = 600): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\bwww\.\S+/gi, "")
    .replace(/[`*_#>]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export const money = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

/** Puntúa una entrada contra el mensaje: frases clave (más peso), palabras clave y solapamiento con título/pregunta. */
export function scoreEntry(message: string, e: { keywords: string[]; title: string; question: string }): number {
  const m = normalize(message);
  const mt = new Set(tokens(message));
  let score = 0;
  for (const k of e.keywords) {
    const nk = normalize(k);
    if (!nk) continue;
    if (nk.includes(" ")) {
      if (m.includes(nk)) score += 3;
    } else if (mt.has(nk)) score += 1.5;
  }
  const qt = new Set([...tokens(e.title), ...tokens(e.question)]);
  if (qt.size) {
    let hit = 0;
    for (const t of qt) if (mt.has(t)) hit++;
    score += (hit / qt.size) * 3;
  }
  return score;
}
