import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const KEY = "sk-or-v1-clave-de-prueba-0123456789";
const state = { model: "openai/gpt-oss-20b", provider: "openrouter" as string };
vi.mock("server-only", () => ({}));
vi.mock("@/lib/env.server", async () => {
  const { z } = await import("zod");
  const aiOpenRouter = z.object({ OPENROUTER_API_KEY: z.string().min(10), AI_MODEL: z.string().regex(/^(?!openrouter\/)[a-z0-9._-]+\/[a-zA-Z0-9._:-]+$/) });
  return {
    serverEnv: {
      ai: () => {
        if (state.provider !== "openrouter") throw new Error("no");
        const c = aiOpenRouter.parse({ OPENROUTER_API_KEY: KEY, AI_MODEL: state.model });
        return { provider: "openrouter" as const, apiKey: c.OPENROUTER_API_KEY, model: c.AI_MODEL };
      },
    },
  };
});

import { generateJson } from "@/lib/ai/llm";

const ok = (content: string, usage = { prompt_tokens: 480, completion_tokens: 70 }) => new Response(JSON.stringify({ model: "openai/gpt-oss-20b", choices: [{ message: { content } }], usage }), { status: 200 });

beforeEach(() => {
  state.model = "openai/gpt-oss-20b";
  state.provider = "openrouter";
});
afterEach(() => vi.unstubAllGlobals());

describe("cliente de IA (OpenRouter, modelo concreto)", () => {
  it("usa el modelo configurado, límites estrictos y SIN herramientas; la clave solo viaja en la cabecera hacia OpenRouter", async () => {
    const f = vi.fn(async () => ok('{"reply":"hola","service_ids":[]}'));
    vi.stubGlobal("fetch", f);
    const r = await generateJson("sistema", "usuario", { maxTokens: 450, timeoutMs: 15_000 });
    expect(r).toMatchObject({ ok: true, provider: "openrouter", model: "openai/gpt-oss-20b", usage: { input: 480, output: 70 } });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("openai/gpt-oss-20b");
    expect(body.max_tokens).toBe(450);
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.provider).toEqual({ require_parameters: true, sort: "latency" });
    expect(body.reasoning).toEqual({ effort: "low", exclude: true });
    for (const k of ["tools", "tool_choice", "functions", "plugins", "web_search_options"]) expect(body).not.toHaveProperty(k);
    expect(JSON.stringify(body)).not.toContain(KEY);
    expect(f).toHaveBeenCalledTimes(1); // un solo intento
  });
  it("no acepta enrutadores dinámicos como modelo (openrouter/free, openrouter/auto) ni slugs mal formados: queda sin configurar y el respaldo responde", async () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    for (const bad of ["openrouter/free", "openrouter/auto", "gpt-oss-20b", "", "openai/ gpt"]) {
      state.model = bad;
      expect(await generateJson("s", "u")).toEqual({ ok: false, reason: "not_configured" });
    }
    expect(f).not.toHaveBeenCalled();
  });
  it("sin proveedor configurado → not_configured (nunca lanza)", async () => {
    state.provider = "ninguno";
    expect(await generateJson("s", "u")).toEqual({ ok: false, reason: "not_configured" });
  });
  it("429, 500, 503 → provider_error sin reintentar y sin registrar la clave", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    for (const status of [429, 500, 503]) {
      const f = vi.fn(async () => new Response("{}", { status, headers: { "retry-after": "5" } }));
      vi.stubGlobal("fetch", f);
      expect(await generateJson("s", "u")).toEqual({ ok: false, reason: "provider_error" });
      expect(f).toHaveBeenCalledTimes(1);
    }
    expect(JSON.stringify(err.mock.calls)).not.toContain(KEY);
    err.mockRestore();
  });
  it("timeout o error de red → provider_error", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw Object.assign(new Error("aborted"), { name: "TimeoutError" }); }));
    expect(await generateJson("s", "u", { timeoutMs: 1 })).toEqual({ ok: false, reason: "provider_error" });
  });
  it("contenido vacío → empty (el router usa el respaldo)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ok("")));
    expect(await generateJson("s", "u")).toEqual({ ok: false, reason: "empty" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [] }), { status: 200 })));
    expect(await generateJson("s", "u")).toEqual({ ok: false, reason: "empty" });
  });
  it("respuesta sin usage no rompe: tokens null", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: "{}" } }] }), { status: 200 })));
    expect(await generateJson("s", "u")).toMatchObject({ ok: true, usage: { input: null, output: null } });
  });
});
