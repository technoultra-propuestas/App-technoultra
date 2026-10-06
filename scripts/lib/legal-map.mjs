// Transformación PURA de los borradores jurídicos (.docx) a texto de la plataforma. No inventa datos legales:
// rellena solo lo que entregó el propietario y deja «[PENDIENTE: …]» en lo demás (la BD impide publicar mientras existan).

/** Documentos de la carpeta Legales/ → documento de la plataforma. `requires` = se acepta en el onboarding (versionado). */
export const LEGAL_FILES = [
  { file: "01_Terminos_y_Condiciones_TechnoUltra.docx", slug: "terms", title: "Términos y condiciones de uso y contratación", requires: true },
  { file: "02_Politica_Tratamiento_Datos_TechnoUltra.docx", slug: "data_policy", title: "Política de tratamiento de datos personales", requires: true },
  { file: "03_Politica_Privacidad_Aviso_TechnoUltra.docx", slug: "privacy", title: "Política de privacidad y aviso de privacidad", requires: false },
  { file: "04_Condiciones_Servicio_Tecnico_TechnoUltra.docx", slug: "service_terms", title: "Condiciones del servicio técnico", requires: false },
  { file: "05_Politica_Garantias_TechnoUltra.docx", slug: "warranty_policy", title: "Política de garantías de productos y servicios", requires: false },
  { file: "06_Condiciones_Compra_Comercio_Electronico_TechnoUltra.docx", slug: "purchase_terms", title: "Condiciones de compra y comercio electrónico", requires: false },
  { file: "07_Politica_Cancelacion_Reembolsos_TechnoUltra.docx", slug: "returns_policy", title: "Política de cancelación, cambios, retracto y reembolsos", requires: false },
  { file: "08_Autorizacion_Tratamiento_Datos_TechnoUltra.docx", slug: "data_authorization", title: "Autorización para el tratamiento de datos personales", requires: true },
  { file: "09_Consentimiento_Diagnostico_IA_TechnoUltra.docx", slug: "ai_consent", title: "Consentimiento e información sobre diagnóstico asistido por IA", requires: false },
];

export const PENDING = { id: "[PENDIENTE: CC/NIT]", city: "[PENDIENTE: ciudad]", email: "[PENDIENTE: correo jurídico]" };

/** @param {{name?:string, phone?:string, address?:string}} biz datos públicos del negocio (CRM → Configuración) */
export function fillPlaceholders(text, biz) {
  const v = (x, fallback) => (x && x.trim() ? x.trim() : fallback);
  return text
    .replace(/\[NOMBRE LEGAL COMPLETO DEL RESPONSABLE \/ TITULAR DE TECHN[0O]ULTRA\]/g, v(biz.name, "[PENDIENTE: nombre del negocio]"))
    .replace(/\[FECHA DE PUBLICACIÓN\]/g, "la fecha de publicación indicada en este documento")
    .replace(/\[CC\/NIT\]/g, PENDING.id)
    .replace(/\[DIRECCIÓN FÍSICA DE NOTIFICACIONES\]/g, v(biz.address, "[PENDIENTE: dirección]"))
    .replace(/\[CIUDAD, COLOMBIA\]/g, `${PENDING.city}, Colombia`)
    .replace(/\[CORREO JURÍDICO\/DE PRIVACIDAD\]/g, PENDING.email)
    .replace(/\[TELÉFONO DE CONTACTO\]/g, v(biz.phone, "[PENDIENTE: teléfono]"));
}

/**
 * Bloques del .docx → texto de la plataforma (formato ligero y seguro: «## título», «- viñeta», párrafos separados por línea en blanco).
 * Se descarta la portada (marca, título, «Versión … [FECHA]», aviso de borrador y lista de «datos que deben completarse»):
 * el título, la versión y la fecha los gestiona la plataforma.
 */
export function docToText(blocks, biz) {
  const first = blocks.findIndex((b) => b.type === "h1");
  const body = first < 0 ? blocks : blocks.slice(first);
  const out = [];
  for (const b of body) {
    if (b.type === "table") {
      for (const r of b.rows) out.push(`- ${fillPlaceholders(r.join(" — "), biz)}`);
      continue;
    }
    const t = fillPlaceholders(b.text, biz).replace(/\s*\n\s*/g, " ").trim();
    if (!t) continue;
    if (b.type === "h1" || b.type === "h2") out.push(`\n## ${t.replace(/^\d+\.\s*/, (m) => m)}`);
    else if (b.type === "h3") out.push(`\n### ${t}`);
    else if (b.type === "li") out.push(`- ${t}`);
    else out.push(`\n${t}`);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

export const pendingMarkers = (text) => [...new Set([...text.matchAll(/\[PENDIENTE:[^\]]*\]/g)].map((m) => m[0]))];
