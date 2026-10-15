/**
 * Domicilio del SERVICIO TÉCNICO (no el envío de productos del Shop: ese tiene su propia configuración `shop_settings.shipping_*`).
 * La tarifa sale de la cobertura del municipio de la dirección (`coverage_areas.home_fee`, configurable por el SUPERADMIN en Cobertura).
 * Una tarifa de domicilio en 0 significa «sin tarifa configurada»: no se inventa un valor ni se promete «gratis»; se avisa que se confirma antes
 * de aceptar la cotización. La recogida sí puede ser gratuita (0 = sin costo).
 */
export type Zone = { dane: string; city: string; covered: Record<string, boolean>; homeFee: number; pickupFee: number };
export type Outlook = { kind: "none" | "fee" | "free" | "fee_missing" | "uncovered" | "no_address"; fee?: number; text: string };

const cop = (n: number) => "$" + Math.round(n).toLocaleString("es-CO");

export function deliveryOutlook(modality: string, zone: Zone | null): Outlook {
  if (modality === "store") {
    // Llevar al local no tiene cargo, pero la dirección debe estar en una ciudad con cobertura del servicio presencial.
    if (zone && zone.covered.store === false) return { kind: "uncovered", text: `Tu dirección en ${zone.city || "esa ciudad"} está fuera de la cobertura presencial. Elige otra dirección o el soporte remoto si el servicio lo permite.` };
    return { kind: "none", text: "" };
  }
  if (modality !== "home" && modality !== "pickup") return { kind: "none", text: "" };
  if (!zone) return { kind: "no_address", text: modality === "home" ? "Elige o registra una dirección para conocer el valor del domicilio." : "Elige o registra la dirección donde recogeremos el equipo." };
  if (zone.covered[modality] === false)
    return { kind: "uncovered", text: `Esa dirección (${zone.city}) está fuera de la cobertura de ${modality === "home" ? "servicio a domicilio" : "recogida"}. Elige otra dirección u otra modalidad.` };
  if (modality === "home") {
    if (!(zone.homeFee > 0)) return { kind: "fee_missing", text: `El valor del domicilio en ${zone.city} aún no está configurado: lo confirmaremos antes de que aceptes la cotización. No se cobra nada sin tu aprobación.` };
    return { kind: "fee", fee: zone.homeFee, text: `Domicilio en ${zone.city}: ${cop(zone.homeFee)}. Se cobra aparte en la cotización; no está incluido en el precio del servicio.` };
  }
  if (zone.pickupFee > 0) return { kind: "fee", fee: zone.pickupFee, text: `Recogida en ${zone.city}: ${cop(zone.pickupFee)}. Se cobra aparte en la cotización.` };
  return { kind: "free", fee: 0, text: `Recogida sin costo en ${zone.city}.` };
}

/** Registro del domicilio/recogida estimado al crear la solicitud (se guarda en `service_requests.service_snapshot.delivery`; el cobro real lo fija la cotización). */
export function deliverySnapshot(modality: "home" | "pickup", zone: Zone) {
  const fee = modality === "home" ? zone.homeFee : zone.pickupFee;
  return { modality, dane_code: zone.dane, city: zone.city, fee: modality === "home" && !(fee > 0) ? null : fee, fee_configured: modality === "pickup" || fee > 0, source: "coverage_areas", captured_at: new Date().toISOString() };
}

export type ModalityOption = { value: string; label: string; enabled: boolean; reason?: string };

const LABEL: Record<string, string> = { store: "Llevar al local", home: "Servicio a domicilio", pickup: "Recogida del equipo", remote: "Soporte remoto" };

/**
 * Opciones del selector «¿Cómo quieres el servicio?». Siempre se muestran «local» y «domicilio» para que el cliente entienda qué existe; la que el
 * servicio NO admite aparece deshabilitada con el motivo (no se inventa disponibilidad). Recogida y remoto solo si el servicio las admite.
 */
export function modalityOptions(allowed: string[]): ModalityOption[] {
  const has = (m: string) => allowed.includes(m);
  const out: ModalityOption[] = (["store", "home"] as const).map((m) => ({
    value: m,
    label: LABEL[m],
    enabled: has(m),
    reason: has(m) ? undefined : m === "home" ? "Este servicio no se presta a domicilio: solo en el local." : "Este servicio no se presta en el local.",
  }));
  for (const m of ["pickup", "remote"] as const) if (has(m)) out.push({ value: m, label: LABEL[m], enabled: true });
  return out;
}
