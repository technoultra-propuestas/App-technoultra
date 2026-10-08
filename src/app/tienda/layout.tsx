import { ShopShell } from "@/components/shop/ShopShell";

/**
 * El Shop usa UN solo shell para todas sus rutas: al navegar entre catálogo, producto y carrito el shell (cabecera/riel/barra inferior) y la
 * sesión NO se vuelven a resolver; solo cambia el contenido. Con sesión de cliente es la app con su navegación; para visitantes, la cabecera pública.
 */
export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <ShopShell>{children}</ShopShell>;
}
