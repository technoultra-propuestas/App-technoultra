// Utilidades comunes de las pruebas E2E: entorno local, TOTP (RFC 6238), buzón local (Inbucket), usuarios de prueba y resultados.
import { createHmac, randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { sleep } from "./browser.mjs";

/** Lee un archivo .env simple (sin interpretar comillas ni expansión). */
export function readEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const l of readFileSync(path, "utf8").split(/\r?\n/)) {
    const i = l.indexOf("=");
    if (i > 0 && !l.startsWith("#")) out[l.slice(0, i).trim()] = l.slice(i + 1).trim();
  }
  return out;
}

export const APP_URL = process.env.E2E_BASE_URL ?? "http://localhost:3000";
export const e2eEnv = () => ({ ...readEnvFile(".env.e2e"), ...Object.fromEntries(Object.entries(process.env).filter(([k]) => k.startsWith("E2E_"))) });

// ---------------------------------------------------------------- TOTP
const b32 = (s) => {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.replace(/[=\s]/g, "").toUpperCase()) bits += A.indexOf(c).toString(2).padStart(5, "0");
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
};
/** Código TOTP de 6 dígitos (solo para las pruebas: la app usa el TOTP de Supabase Auth). `offset` = periodos de 30 s. */
export function totp(secret, offset = 0, now = Date.now()) {
  const c = Buffer.alloc(8);
  c.writeBigUInt64BE(BigInt(Math.floor(now / 30000) + offset));
  const h = createHmac("sha1", b32(secret)).update(c).digest();
  const o = h[19] & 15;
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

// ---------------------------------------------------------------- correo local (Mailpit de `supabase start`)
export function inbucket(base = "http://127.0.0.1:56324") {
  return {
    /** Espera un correo (asunto que cumpla `re`) recibido DESPUÉS de `since`. Devuelve texto, html y enlaces. */
    async wait(email, { re = /./, since = 0, timeout = 60000 } = {}) {
      const t0 = Date.now();
      while (Date.now() - t0 < timeout) {
        const res = await (await fetch(`${base}/api/v1/search?query=${encodeURIComponent("to:" + email)}`)).json().catch(() => ({ messages: [] }));
        const m = (res.messages ?? []).find((x) => re.test(x.Subject) && new Date(x.Created).getTime() >= since - 1500);
        if (m) {
          const full = await (await fetch(`${base}/api/v1/message/${m.ID}`)).json();
          const html = full.HTML ?? "";
          const text = full.Text ?? "";
          const links = [...(html + " " + text).matchAll(/https?:\/\/[^\s"'<>]+/g)].map((x) => x[0].replace(/&amp;/g, "&"));
          return { subject: m.Subject, from: m.From?.Address, text, html, links };
        }
        await sleep(1000);
      }
      return null;
    },
  };
}

// ---------------------------------------------------------------- resultados
export function createReporter(title) {
  const results = [];
  return {
    check(name, ok, extra = "") {
      results.push({ name, ok: Boolean(ok) });
      console.log(`${ok ? "PASS" : "FAIL"} ${name}${extra ? " — " + extra : ""}`);
      return Boolean(ok);
    },
    summary() {
      const bad = results.filter((r) => !r.ok);
      console.log(`\n${title}: ${results.length - bad.length}/${results.length} pruebas OK`);
      if (bad.length) console.log("FALLOS:", bad.map((b) => b.name).join(" | "));
      return bad.length === 0;
    },
    results,
  };
}

export const randomPassword = () => "Qa-" + randomBytes(9).toString("base64url") + "7!";
export const stamp = () => randomBytes(3).toString("hex");
