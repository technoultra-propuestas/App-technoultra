// Acciones de alto nivel que reutilizan los escenarios: registro de cliente con correo, onboarding e inicio de sesión del personal con MFA.
import { sleep } from "./browser.mjs";
import { totp } from "./support.mjs";

/** Espera un texto en pantalla; si no aparece, falla con lo que SÍ se ve (para diagnosticar). */
export async function must(b, re, ms = 15000) {
  if (await b.waitText(re, ms)) return;
  throw new Error(`No apareció ${re} en ${await b.path()}: ` + (await b.text()).replace(/\s+/g, " ").slice(0, 300));
}

/** Registro real por la interfaz + verificación por el enlace del correo (Inbucket). Termina en /onboarding. */
export async function signUpClient(b, mail, { email, password, fullName }) {
  const since = Date.now();
  await b.clearCookies();
  await b.goto("/registro");
  await b.fill("fullName", fullName);
  await b.fill("email", email);
  await b.fill("password", password);
  await b.check("terms");
  await b.click("form button[type=submit]");
  await must(b, /Revisa tu correo/i, 15000);
  const m = await mail.wait(email, { since, re: /./ });
  const link = m?.links.find((l) => /auth\/v1\/verify|confirm/.test(l));
  if (!link) return { ok: false, reason: "no llegó el correo de verificación" };
  // El enlace apunta al GoTrue local (host interno); se abre tal cual: redirige a /auth/callback de la app.
  await b.goto(link, 4000);
  return { ok: true, landed: await b.waitPath((p) => p.startsWith("/onboarding"), 20000), mail: m };
}

/** Completa los 6 pasos del onboarding por la interfaz. Devuelve la ruta final (esperada: /c). */
export async function completeOnboarding(b, { phone = "3001234567", dane = "76001", address = "Calle 5 # 38-20", brand = "Lenovo", model = "ThinkPad E14" } = {}) {
  const next = (label) => b.clickText(label, "body");
  await next("Empezar");
  await must(b, /PASO 2 DE 6/i, 30000);
  await b.fill("phone", phone);
  await next("Continuar");
  await must(b, /PASO 3 DE 6/i, 30000);
  await b.fill("dane", dane);
  await b.fill("line1", address);
  await next("Continuar");
  await must(b, /PASO 4 DE 6/i, 30000);
  await b.fill("brand", brand);
  await b.fill("model", model);
  await next("Guardar equipo");
  await must(b, /PASO 5 DE 6/i, 30000);
  await next("Omitir por ahora");
  await must(b, /PASO 6 DE 6/i, 30000);
  await b.check("accept");
  await next("Finalizar");
  return b.waitPath((p) => p === "/c" || p.startsWith("/c?"), 20000);
}

/** Inicio de sesión de cliente por /login. */
export async function clientLogin(b, { email, password }) {
  await b.clearCookies();
  await b.goto("/login");
  await b.fill("email", email);
  await b.fill("password", password);
  await b.click("form button[type=submit]");
  return b.waitPath((p) => !p.startsWith("/login"), 15000);
}

// Supabase no acepta dos veces el mismo código TOTP: si ya se usó en esta ventana de 30 s se espera a la siguiente.
const lastStep = new Map();
export async function freshWindow(secret) {
  const step = () => Math.floor(Date.now() / 30000);
  while (lastStep.get(secret) === step()) await sleep(1000);
  lastStep.set(secret, step());
}

/**
 * Inicio de sesión del personal en /gestion/login con MFA. Si aún no tiene factor, lo enrola leyendo la clave manual de
 * la pantalla (igual que lo haría la persona con su app autenticadora). Devuelve { path, secret }.
 */
export async function staffLogin(b, { email, password, secret }) {
  await b.clearCookies();
  await b.goto("/gestion/login");
  await b.fill("email", email);
  await b.fill("password", password);
  await b.click("form button[type=submit]");
  await b.waitPath((p) => p.startsWith("/gestion/mfa"), 15000);
  if (!secret) {
    await b.clickText("Configurar autenticador", "body");
    await must(b, /clave manual/i, 15000);
    await b.clickText("Mostrar clave manual", "body");
    await sleep(500);
    secret = (await b.eval(`document.querySelector('p.font-mono')?.innerText ?? ''`)).replace(/\s+/g, "");
    if (!secret) throw new Error("No se pudo leer la clave manual de MFA: " + (await b.text()).replace(/\s+/g, " ").slice(0, 300));
  }
  // El código del periodo actual; si Supabase lo rechaza por desfase/reuso, se prueba el siguiente periodo.
  for (const offset of [0, 1]) {
    await freshWindow(secret);
    await b.fill("code", totp(secret, offset));
    await b.clickText(secret && (await b.text()).includes("Activar verificación") ? "Activar verificación" : "Verificar", "body");
    const p = await b.waitPath((x) => !x.startsWith("/gestion/mfa"), 8000);
    if (!p.startsWith("/gestion/mfa")) return { path: p, secret };
    await sleep(31000);
  }
  return { path: await b.path(), secret };
}
