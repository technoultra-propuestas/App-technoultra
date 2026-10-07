import { redirect } from "next/navigation";

/**
 * El catálogo comercial vive en el SHOP público (/tienda), que se cierra por WhatsApp. Esta ruta antigua se conserva solo para no romper
 * enlaces guardados. El flujo de pedidos con pago en línea sigue existiendo (/c/carrito, /c/pedidos) para productos propios si algún día se publican.
 */
export default function LegacyClientStore(): never {
  redirect("/tienda");
}
