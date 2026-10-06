export const LEGAL_SLUGS = [
  { slug: "terms", label: "Términos y condiciones" },
  { slug: "privacy", label: "Política de privacidad" },
  { slug: "data_policy", label: "Tratamiento de datos personales" },
  { slug: "data_authorization", label: "Autorización de tratamiento de datos" },
  { slug: "service_terms", label: "Condiciones del servicio técnico" },
  { slug: "warranty_policy", label: "Política de garantías" },
  { slug: "purchase_terms", label: "Condiciones de compra" },
  { slug: "returns_policy", label: "Cancelaciones, retracto y reembolsos" },
  { slug: "ai_consent", label: "Diagnóstico asistido por IA" },
  { slug: "consents", label: "Otros consentimientos" },
] as const;

export type LegalSlug = (typeof LEGAL_SLUGS)[number]["slug"];
export const isLegalSlug = (s: string): s is LegalSlug => LEGAL_SLUGS.some((x) => x.slug === s);
/** Documentos que se muestran en el pie y en el índice público (el resto de slugs es de uso interno/futuro). */
export const PUBLIC_LEGAL_SLUGS = LEGAL_SLUGS.filter((s) => s.slug !== "consents");

export type LegalBlock = { type: "h2" | "h3" | "p" | "ul"; text?: string; items?: string[] };

/**
 * Texto legal de la plataforma → bloques. Formato ligero y SEGURO (nunca HTML): «## título», «### subtítulo», «- viñeta» y
 * párrafos separados por línea en blanco. React escapa todo el texto.
 */
export function parseLegalText(content: string): LegalBlock[] {
  const blocks: LegalBlock[] = [];
  let gap = true; // hubo una línea en blanco desde el último bloque
  for (const raw of content.replace(/\r\n/g, "\n").split("\n")) {
    const line = raw.trim();
    if (!line) {
      gap = true;
      continue;
    }
    if (line.startsWith("### ")) blocks.push({ type: "h3", text: line.slice(4) });
    else if (line.startsWith("## ")) blocks.push({ type: "h2", text: line.slice(3) });
    else if (line.startsWith("- ")) {
      const last = blocks[blocks.length - 1];
      if (last?.type === "ul") last.items!.push(line.slice(2));
      else blocks.push({ type: "ul", items: [line.slice(2)] });
    } else {
      const last = blocks[blocks.length - 1];
      // líneas consecutivas sin línea en blanco forman un solo párrafo
      if (last?.type === "p" && !gap) last.text += ` ${line}`;
      else blocks.push({ type: "p", text: line });
    }
    gap = false;
  }
  return blocks;
}

export const pendingMarkers = (content: string) => [...new Set([...content.matchAll(/\[PENDIENTE:[^\]]*\]/g)].map((m) => m[0]))];

export const slugifyHeading = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
