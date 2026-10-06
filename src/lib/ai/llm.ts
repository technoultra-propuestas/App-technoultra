import "server-only";
import { serverEnv } from "@/lib/env.server";

export type LlmResult = { ok: true; text: string; model: string } | { ok: false; reason: "not_configured" | "provider_error" | "empty" };

/**
 * Llamada al proveedor de IA SOLO desde el servidor (`AI_PROVIDER`: «openrouter» o «gemini»). La clave viaja en un encabezado,
 * nunca en la URL ni en el navegador. Respuesta forzada a JSON; el resultado se valida aparte antes de usarse y la IA
 * nunca cambia estados, precios ni pagos.
 */
export async function generateJson(system: string, user: string): Promise<LlmResult> {
  let cfg: ReturnType<typeof serverEnv.ai>;
  try {
    cfg = serverEnv.ai();
  } catch {
    return { ok: false, reason: "not_configured" };
  }
  try {
    return cfg.provider === "openrouter" ? await openrouter(cfg, system, user) : await gemini(cfg, system, user);
  } catch {
    return { ok: false, reason: "provider_error" };
  }
}

type Cfg = ReturnType<typeof serverEnv.ai>;

async function openrouter(cfg: Cfg, system: string, user: string): Promise<LlmResult> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${cfg.apiKey}`, "X-Title": "TechnoUltra" },
    body: JSON.stringify({
      model: cfg.model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      response_format: { type: "json_object" },
      temperature: 0.2,
      max_tokens: 900,
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    console.error("ai.http", { provider: "openrouter", status: res.status });
    return { ok: false, reason: "provider_error" };
  }
  const json = (await res.json()) as { model?: string; choices?: { message?: { content?: string } }[] };
  const text = json.choices?.[0]?.message?.content ?? "";
  return text ? { ok: true, text, model: json.model ?? cfg.model } : { ok: false, reason: "empty" };
}

async function gemini(cfg: Cfg, system: string, user: string): Promise<LlmResult> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(cfg.model)}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { responseMimeType: "application/json", temperature: 0.2, maxOutputTokens: 900 },
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    console.error("ai.http", { provider: "gemini", status: res.status });
    return { ok: false, reason: "provider_error" };
  }
  const json = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
  return text ? { ok: true, text, model: cfg.model } : { ok: false, reason: "empty" };
}
