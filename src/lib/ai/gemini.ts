import "server-only";
import { serverEnv } from "@/lib/env.server";

export type GeminiResult = { ok: true; text: string; model: string } | { ok: false; reason: "not_configured" | "provider_error" | "empty" };

/**
 * Llamada a Gemini (Google AI Studio) SOLO desde el servidor. La clave viaja en un encabezado, nunca en la URL
 * ni en el navegador. Respuesta forzada a JSON; el resultado se valida aparte antes de usarse.
 */
export async function generateJson(system: string, user: string): Promise<GeminiResult> {
  let env: { GEMINI_API_KEY: string; GEMINI_MODEL: string };
  try {
    env = serverEnv.ai();
  } catch {
    return { ok: false, reason: "not_configured" };
  }
  try {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": env.GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents: [{ role: "user", parts: [{ text: user }] }],
        generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 900 },
      }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) {
      console.error("gemini.http", res.status);
      return { ok: false, reason: "provider_error" };
    }
    const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
    const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
    return text ? { ok: true, text, model: env.GEMINI_MODEL } : { ok: false, reason: "empty" };
  } catch {
    return { ok: false, reason: "provider_error" };
  }
}
