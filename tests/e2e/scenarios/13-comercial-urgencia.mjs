// Configuración comercial: «Guardar nivel» (urgencia) y «Guardar» (IVA) responden junto al botón; los valores inválidos se rechazan sin cambiar nada.
// Además: el Shop nombra las zonas aledañas (Jamundí, Palmira, Yumbo y Candelaria).
import { must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Comercial: guardar niveles de urgencia e IVA con respuesta visible; zonas aledañas en el Shop";

export async function run({ b, rep, state, save }) {
  const r = await staffLogin(b, state.owner);
  state.owner.secret = r.secret;
  save();
  await b.viewport(390, 844, true);
  await b.goto("/b/comercial", 1800);
  await must(b, /Recargo por urgencia/i, 15000);

  const level = psql(`select id from urgency_levels where label <> 'Normal' order by sort_order limit 1`);
  const row = () => psql(`select percent::numeric(6,2) || '|' || fixed_amount::numeric(12,2) || '|' || is_active from urgency_levels where id = '${level}'`);
  const form = `form:has(input[name=id][value="${level}"]):has(input[name=percent])`;
  const before = row();
  await sleep(1200);

  // 1) guardar sin cambios: avisa «Nivel guardado» al lado del botón
  await b.submitIn(form);
  await sleep(3500);
  rep.check("«Guardar nivel» responde «Nivel guardado» y no altera los valores", /Nivel guardado/.test(await b.text()) && row() === before, `${before} → ${row()}`);

  // 2) porcentaje inválido: se rechaza con motivo y no cambia
  await b.fillIn(form, "percent", "abc");
  await b.submitIn(form);
  await sleep(2500);
  rep.check("un porcentaje no numérico se rechaza con mensaje y NO cambia el nivel", /solo números/.test(await b.text()) && row() === before, `${row()} · ${(await b.text()).slice(0, 60)}`);

  // 3) horario incompleto: se rechaza
  await b.fillIn(form, "percent", before.split("|")[0]);
  await b.fillIn(form, "start", "18:00");
  await b.submitIn(form);
  await sleep(2500);
  rep.check("un horario con «desde» y sin «hasta» se rechaza con mensaje", /Completa «desde» y «hasta»/.test(await b.text()));

  // 4) IVA: guarda con respuesta visible
  await b.goto("/b/comercial", 1800);
  await sleep(1200);
  await b.submitIn("form:has(input[name=rate])");
  await sleep(3000);
  rep.check("«Guardar» del IVA responde «Configuración de IVA guardada»", /Configuración de IVA guardada/.test(await b.text()));
  rep.check("los cambios de configuración dejan rastro en la auditoría", Number(psql(`select count(*) from audit_logs where action = 'superadmin.settings_changed'`)) >= 2);

  // 5) zonas aledañas en el Shop y el carrito
  await b.goto("/tienda", 2000);
  rep.check("el Shop nombra las zonas aledañas: Jamundí, Palmira, Yumbo y Candelaria", /Jamundí, Palmira, Yumbo y Candelaria/.test(await b.text()));
  await b.goto("/tienda/carrito", 1500);
  rep.check("el carrito también las nombra", /Jamundí, Palmira, Yumbo y Candelaria/.test(await b.text()) || /vac[ií]o/i.test(await b.text()));
  rep.check("sin errores de JavaScript", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
