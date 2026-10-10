import { copFormat } from "@/lib/catalog/normalize";
import { OUTSIDE_ZONES_TEXT, PRODUCT_SHIPPING_CALI_OUTSIDE, PRODUCT_SHIPPING_CALI_URBAN } from "@/lib/catalog/config";

/** Domicilio de productos: informativo (no se cobra en la app). Las tarifas las administra el SUPERADMIN (shop_settings); la final se confirma por dirección. */
export function ShippingInfo({ compact = false, urban = PRODUCT_SHIPPING_CALI_URBAN, outside = PRODUCT_SHIPPING_CALI_OUTSIDE, note = "Valor sujeto a validación de dirección." }: { compact?: boolean; urban?: number; outside?: number; note?: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-paper p-4 text-[14px] leading-snug text-ink-2">
      <div className="font-extrabold text-ink">Entrega en Cali desde {copFormat(urban)}</div>
      {compact ? null : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 font-semibold">
          <li>{copFormat(urban)} dentro del perímetro urbano de Cali.</li>
          <li>{copFormat(outside)} fuera del perímetro urbano y en zonas aledañas ({OUTSIDE_ZONES_TEXT}).</li>
        </ul>
      )}
      <div className="text-[13px] text-muted">La tarifa final se confirma según la dirección. {note}</div>
    </div>
  );
}
