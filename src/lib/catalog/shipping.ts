import perimeter from "@/data/cali-urban-perimeter.json";
import { PRODUCT_SHIPPING_CALI_OUTSIDE, PRODUCT_SHIPPING_CALI_URBAN } from "./config";

/**
 * Domicilio de PRODUCTOS (informativo; no se cobra en la app). Distinto de las tarifas de servicios técnicos (`coverage_areas`).
 * Referencia geográfica oficial: «POT - Perímetro urbano» de Santiago de Cali (datos.cali.gov.co, DAPM, CC BY-SA), simplificado a ~3 m.
 * La tarifa nunca se deduce del texto «Cali» escrito por el cliente: solo de coordenadas verificadas contra el polígono.
 */
export type LatLng = { lat: number; lng: number };
export type ShippingQuote =
  | { zone: "cali_urban"; fee: number; note: string }
  | { zone: "outside"; fee: number; note: string }
  | { zone: "unknown"; fee: null; note: string };

const ring = perimeter.ring as [number, number][];

/** Punto en polígono (trazado de rayos). `poly` es [lng, lat]. */
export function pointInRing(p: LatLng, poly: readonly [number, number][] = ring): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > p.lat !== yj > p.lat && p.lng < ((xj - xi) * (p.lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

const toRad = (d: number) => (d * Math.PI) / 180;
export function haversineKm(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

/** Distancia al vértice más cercano del perímetro (los vértices están a pocos metros entre sí). */
export const distanceToPerimeterKm = (p: LatLng, poly: readonly [number, number][] = ring) => Math.min(...poly.map(([lng, lat]) => haversineKm(p, { lat, lng })));

/**
 * Más allá de esta distancia del perímetro urbano, la entrega se cotiza aparte. Referencia técnica por distancia (no se usa en la tienda actual).
 * La definición comercial de «zonas aledañas» es por MUNICIPIO (Jamundí, Palmira, Yumbo y Candelaria; ver `PRODUCT_SHIPPING_OUTSIDE_ZONES` y docs/PRODUCT-SHIPPING.md).
 */
export const MAX_OUTSIDE_KM = 30;

export function quoteProductShipping(point: LatLng | null | undefined, opts: { maxOutsideKm?: number; polygon?: readonly [number, number][] } = {}): ShippingQuote {
  const unknown: ShippingQuote = { zone: "unknown", fee: null, note: "Consultar disponibilidad y costo de entrega." };
  if (!point || !Number.isFinite(point.lat) || !Number.isFinite(point.lng)) return unknown;
  if (point.lat < -5 || point.lat > 14 || point.lng < -82 || point.lng > -66) return unknown; // fuera de Colombia: dato no confiable
  const poly = opts.polygon ?? ring;
  if (pointInRing(point, poly)) return { zone: "cali_urban", fee: PRODUCT_SHIPPING_CALI_URBAN, note: "Dentro del perímetro urbano de Cali." };
  if (distanceToPerimeterKm(point, poly) <= (opts.maxOutsideKm ?? MAX_OUTSIDE_KM)) {
    return { zone: "outside", fee: PRODUCT_SHIPPING_CALI_OUTSIDE, note: "Fuera del perímetro urbano de Cali (zonas periféricas o aledañas)." };
  }
  return unknown;
}
