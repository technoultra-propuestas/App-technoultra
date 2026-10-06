// Cliente: registro con verificación por correo, onboarding completo y guardas de acceso (cliente no entra al CRM).
import { completeOnboarding, signUpClient } from "../lib/actors.mjs";
import { randomPassword, stamp } from "../lib/support.mjs";

export const title = "Cliente: registro, correo, onboarding y límites de acceso";

export async function run({ b, mail, rep, state, save }) {
  const s = stamp();
  state.client = { email: `cliente-${s}@e2e.technoultra.test`, password: randomPassword(), fullName: "Cliente Prueba E2E" };

  const r = await signUpClient(b, mail, state.client);
  rep.check("llega el correo de verificación y el enlace abre el onboarding", r.ok && r.landed?.startsWith("/onboarding"), r.reason ?? r.landed);
  rep.check("el correo trae enlace (no código) y remite a la app", r.mail && !/\b\d{6}\b/.test(r.mail.text ?? "") && r.mail.links.some((l) => /redirect_to=/.test(l)));

  const end = await completeOnboarding(b);
  rep.check("el onboarding termina en el panel del cliente (/c)", end === "/c", end);
  if (end !== "/c") console.log("   pantalla:", (await b.text()).replace(/\s+/g, " ").slice(0, 400));
  save();

  await b.goto("/b");
  rep.check("el cliente NO entra al CRM (/b)", !(await b.path()).startsWith("/b"), await b.path());
  await b.goto("/gestion/login");
  rep.check("el cliente autenticado no obtiene acceso de personal", !(await b.path()).startsWith("/b"), await b.path());
  rep.check("sin errores de JavaScript en el navegador", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
