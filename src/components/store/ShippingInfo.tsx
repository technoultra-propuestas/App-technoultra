import { copFormat } from "@/lib/catalog/normalize";
import { PRODUCT_SHIPPING_CALI_OUTSIDE, PRODUCT_SHIPPING_CALI_URBAN } from "@/lib/catalog/config";

/** Domicilio de productos: informativo (no se cobra en la app). La tarifa final se confirma por WhatsApp según la dirección. */
export function ShippingInfo({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex flex-col gap-1 rounded-[14px] bg-paper p-4 text-[14px] leading-snug text-ink-2">
      <div className="font-extrabold text-ink">Entrega en Cali desde {copFormat(PRODUCT_SHIPPING_CALI_URBAN)}</div>
      {compact ? null : (
        <ul className="m-0 flex list-none flex-col gap-0.5 p-0 font-semibold">
          <li>{copFormat(PRODUCT_SHIPPING_CALI_URBAN)} dentro del perímetro urbano de Cali.</li>
          <li>{copFormat(PRODUCT_SHIPPING_CALI_OUTSIDE)} fuera del perímetro urbano y zonas aledañas.</li>
        </ul>
      )}
      <div className="text-[13px] text-muted">La tarifa final se confirma según la dirección. Valor sujeto a verificación.</div>
    </div>
  );
}
