// Cobertura presencial: «Guardar tarifas» debe guardar de verdad, avisar del resultado y respetar permisos; las tarifas existentes no cambian.
import { must, staffLogin } from "../lib/actors.mjs";
import { sleep } from "../lib/browser.mjs";
import { psql } from "../lib/fixtures.mjs";

export const title = "Cobertura: guardar tarifas por municipio";

export async function run({ b, rep, state, save }) {
  const r = await staffLogin(b, state.owner);
  state.owner.secret = r.secret;
  save();
  await b.viewport(1440, 900);
  await b.goto("/b/cobertura", 1500);
  await must(b, /Cobertura presencial/i, 15000);
  const dane = "76001";
  const row = () => psql(`select pickup_fee::int || '|' || home_fee::int from coverage_areas where dane_code = '${dane}'`);
  const before = row();
  const formSel = `form:has(input[name=id][value="${psql(`select id from coverage_areas where dane_code = '${dane}'`)}"]):has(input[name=homeFee])`;
  await sleep(1200);
  // 1) cambiar la tarifa de domicilio y guardar
  await b.fillIn(formSel, "homeFee", "16000");
  await b.submitIn(formSel);
  await sleep(3500);
  rep.check("«Guardar tarifas» guarda el nuevo valor en la base de datos", row() === `${before.split("|")[0]}|16000`, `${before} → ${row()}`);
  rep.check("avisa que las tarifas se guardaron", /Tarifas guardadas/i.test(await b.text()), (await b.text()).slice(0, 120));
  // 2) valor inválido: se rechaza con mensaje y no cambia nada
  await b.fillIn(formSel, "homeFee", "-5x");
  await b.submitIn(formSel);
  await sleep(2500);
  rep.check("un valor no numérico («-5x») se rechaza con mensaje y NO cambia la tarifa", row() === `${before.split("|")[0]}|16000` && /Escribe solo números/.test(await b.text()), `${row()} · ${(await b.text()).slice(0, 80)}`);
  // 3) restaurar el valor original (las tarifas existentes quedan tal cual)
  await b.fillIn(formSel, "homeFee", before.split("|")[1]);
  await b.fillIn(formSel, "pickupFee", before.split("|")[0]);
  await b.submitIn(formSel);
  await sleep(3000);
  rep.check("las tarifas originales se restauran sin cambios", row() === before, `${before} vs ${row()}`);
  rep.check("el cambio de tarifas deja rastro en la auditoría", Number(psql(`select count(*) from audit_logs where entity_type = 'coverage_areas' and action ilike '%update%'`)) >= 1);
  rep.check("sin errores de JavaScript", b.errors.length === 0, b.errors.slice(0, 2).join(" | "));
}
