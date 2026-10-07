# Catálogo Excelenter en la tienda de TechnoUltra

Los productos de Excelenter se muestran en `/tienda` con la identidad de TechnoUltra y **se cierran por WhatsApp (+57 318 394 3465)**. No hay carrito, checkout ni Mercado Pago para estos productos. Mercado Pago sigue existiendo solo para los servicios propios.

## Arquitectura
```
Fuente (CSV / hoja publicada / API futura)
        ↓  CatalogProvider  (src/lib/catalog/provider.ts)
Motor de sincronización     (src/lib/catalog/sync.ts → RPC public.sync_catalog)
        ↓
Supabase: products (+ product_source, product_price_history, catalog_sync_runs)
        ↓
Tienda pública /tienda · Administración /b/tienda
```
- **Una sola tabla de productos** (`products`). Los de proveedor llevan `source = 'EXCELENTER'`.
- **Costo del proveedor** (`product_source.source_price`, `source_stock`) solo lo lee la administración (RLS). El público ve únicamente el precio final.
- Migración: `supabase/migrations/20261007000034_excelenter_catalog.sql` (aplicada). Pruebas: `tests/db/excelenter-catalog.test.ts`, `tests/unit/catalog-excelenter.test.ts`.

## Identidad (sin duplicados)
`(source, source_product_id)` es único. `source_product_id` es la **referencia normalizada** (espacios colapsados, mayúsculas). Si llega otra vez, se **actualiza**, no se inserta.
- Misma referencia **y mismo nombre** → un solo producto (se conserva la fila con imagen).
- Misma referencia con **nombres distintos** (hay casos reales: «Generico B», «Generico N») → son productos distintos; cada uno recibe un identificador interno `REF~HASH` estable (no depende del orden de las filas). La referencia visible no cambia.
- El `slug` público se calcula una vez al crear y **no cambia** aunque se renombre el producto.

## Categorías y subcategorías
Se usan **exactamente** las del catálogo fuente. La identidad es el nombre normalizado (sin acentos, minúsculas, espacios colapsados): «Periféricos» = «PERIFERICOS» = «Periféricos ». Una subcategoría pertenece a **una** categoría (`product_subcategories.category_id`, único por categoría+nombre). Un producto sin subcategoría en la fuente queda sin subcategoría (no se inventa).

## Precio
`precio TechnoUltra = precio fuente × 1,20` (el 20 % es sobre el precio fuente, no sobre el final). Aritmética entera exacta en COP: 100 000 → 120 000 · 110 000 → 132 000 · 90 000 → 108 000. Se calcula **en la base de datos** (`sync_catalog`); la columna `price` de un producto de proveedor no puede editarse a mano (disparador `guard_source_product`). Cada cambio queda en `product_price_history`. Si el precio fuente cambia más de 20 % en una corrida, la corrida lo registra como alerta `price_jump` (no se bloquea).

## Disponibilidad (el stock es una señal)
- `stock > 0` → visible, se muestra **«1 unidad disponible»** (nunca otra cantidad) y «Disponibilidad y precio sujetos a confirmación por WhatsApp».
- `stock = 0`, o producto que **ya no aparece** en la fuente → `source_available = false` (no se borra; se guarda motivo `out_of_stock` / `missing_from_source`, fecha, último precio, categoría y subcategoría).
- Si **vuelve**, se reactiva.
- **La decisión manual prevalece:** visible al público = `is_active` (SUPERADMIN) **y** `source_available`. La sincronización nunca toca `is_active`.
- Producto no disponible/oculto: no sale en listados, búsquedas ni filtros, y su URL responde 404 (RLS).

## Fallos de la fuente
- Fuente caída, formato inválido o sin configurar → se registra el error y **no se toca el catálogo** (se conserva el último estado válido). La tienda no se vacía.
- Fuente vacía, o que trae **menos de la mitad** de los productos disponibles actuales → la corrida se rechaza (`empty_source` / `suspicious_drop`) sin modificar nada.
- Fila con precio nulo/0/negativo, sin nombre o sin referencia → se omite y se registra; no destruye el último dato válido ni oculta el producto.
- Una imagen vacía no borra la última imagen válida.

## Sincronización
- **Automática:** `GET /api/cron/catalog-sync` (Vercel Cron diario, 09:00 UTC) protegida con `CRON_SECRET` (comparación en tiempo constante, 503 sin secreto, 401 sin él). Si la fuente no está configurada no genera ruido.
- **Manual (SUPERADMIN con MFA):** `/b/tienda/sincronizacion` → «Sincronizar ahora» o «Importar CSV».
- **Registro** (`catalog_sync_runs`): fecha, tipo (manual/automática/importación), estado, productos vistos/nuevos/actualizados, precios y stock cambiados, activados/ocultos, errores, alertas y duración. Visible en la administración.
- **Importación inicial:** `npx tsx scripts/import-excelenter.mts "<archivo.csv>" [--apply]` (sin `--apply` solo imprime el reporte Categoría | Subcategorías | Productos y las incidencias; verifica que el proyecto sea el de TechnoUltra).

## Fuente real (cómo conectarla)
El proveedor automático lee un **CSV por https** desde `EXCELENTER_CATALOG_CSV_URL` (y opcionalmente `EXCELENTER_CATALOG_TOKEN` como `Authorization: Bearer`). Columnas: `referencia, nombre, marca, categoria, subcategoria, precio, cantidad, descripcion, imagen_url, activo`.
- Hoja de Google: debe estar compartida como «Cualquier persona con el enlace puede ver» (o publicada en la web); la URL es `https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=0`. **Una hoja privada devuelve 401** y la sincronización falla de forma segura.
- Si Excelenter ofrece más adelante una API (p. ej. WooCommerce REST), basta con otra implementación de `CatalogProvider`; el motor, la base de datos y la tienda no cambian. No se hace scraping.

## WhatsApp
Enlace `https://wa.me/573183943465?text=…` con mensaje dinámico (producto, referencia, marca, categoría, precio publicado) codificado con `encodeURIComponent`. El botón registra la consulta (`product_inquiries`, solo producto y hora; sin datos personales) y nunca bloquea la apertura de WhatsApp. No requiere cuenta.

## Seguridad
RLS en todas las tablas nuevas; costo del proveedor y registros solo para administración; `sync_catalog` solo `service_role`; el navegador nunca fija precio, stock, categoría ni visibilidad pública; un disparador impide que un producto de proveedor entre a un pedido (sin cobro por Mercado Pago). Auditoría de cambios con los disparadores existentes.

## Imágenes
Se usan las URLs de la fuente (Cloudinary de Excelenter) con optimización `f_auto,q_auto,w_*`; si falla la carga se muestra un recuadro neutro. Riesgo: dependemos de que esas imágenes sigan publicadas; copiarlas a la cuenta de TechnoUltra es una mejora posible si Excelenter lo autoriza.
