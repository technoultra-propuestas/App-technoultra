# PERFORMANCE-AUDIT-REPORT — navegación del Shop

Fecha: 2026-10-07 · Alcance: `/tienda`, ficha de producto, producto → producto, carrito. Sin cambios de diseño, textos, tipografía, RLS ni Mercado Pago.

## 1. Problema encontrado
Al pasar de un producto a otro (o del Shop a un producto) la pantalla se queda quieta hasta que llega la página nueva: no hay respuesta visual al clic y cada navegación espera una renderización completa en el servidor.

## 2. Causa raíz (medida en producción, `app.technoultra.com`, 3–9 muestras por ruta)

| Medición real | Resultado |
|---|---|
| Línea base de red (archivo estático en caché, `/robots.txt`) | 0,33 s hasta el primer byte |
| Ficha de producto | 0,61–0,84 s (siempre `x-vercel-cache: MISS`: se renderiza en cada visita) |
| `/tienda` | 0,86–1,10 s, 131 KB de HTML |
| `/tienda/carrito` (sin datos propios) | 0,59–0,62 s |
| Región de las funciones de Vercel | `iad1` (Virginia, EE. UU. este) |
| Región de Supabase | `us-west-2` (Oregón, EE. UU. oeste), según el pooler enlazado |

Causas comprobadas en el código:
1. **Sin `loading.tsx` en el Shop** (solo existía en `/c` y `/b`): al pulsar un producto no hay nada que mostrar ni que precargar; el navegador espera el servidor completo (0,3–0,5 s de servidor sobre la línea base).
2. **Ficha de producto con consultas en cadena**: producto → ajustes del Shop (secuenciales) y producto consultado dos veces (metadatos + página). Cada consulta cruza de Virginia a Oregón.
3. **Todas las lecturas públicas del catálogo van a la base en cada visita** (productos, facetas, banner, ajustes), aunque son datos públicos que casi nunca cambian.
4. **El shell (sesión, contador de avisos) se resolvía en cada página** del Shop.
5. **Funciones en Virginia y base en Oregón**: cada ida y vuelta a la base pesa ~60–70 ms; con varias consultas en cadena suma cientos de ms. (Hallazgo de infraestructura; ver recomendaciones.)

## 3. Evidencia
Cifras de la tabla anterior (curl contra producción, 2026-10-07). Cabecera `X-Vercel-Id: iad1::iad1::…`. Región del pooler: `aws-0-us-west-2`. Revisión de código de `src/lib/catalog/queries.ts`, `src/app/tienda/**`, `src/components/shop/ShopShell.tsx`.

## 4. Métrica antes
Ficha de producto 0,61–0,84 s (primer byte), `/tienda` 0,86–1,10 s, sin esqueleto ni respuesta visual al clic, 2 consultas de producto por ficha + 1 de ajustes en secuencia.

## 5. Cambios realizados
1. `src/app/tienda/loading.tsx` y `producto/[slug]/loading.tsx`: esqueletos con la forma real de la página. **Respuesta visual inmediata** y precarga del esqueleto por `Link`.
2. `src/app/tienda/layout.tsx`: **un solo shell** (`ShopShell`) para todo el Shop. Al navegar no se vuelve a resolver sesión ni avisos; la barra inferior no parpadea.
3. `unstable_cache` (60 s, etiqueta `catalog`) en lecturas públicas del catálogo y ajustes/banner del Shop. Deduplica la consulta repetida de la ficha. Se invalida **al instante** (`revalidateTag("catalog", { expire: 0 })`) al editar productos/ajustes/banners, al sincronizar desde el panel y en el cron. Datos fuera de la app (SQL directo, script de importación) tardan hasta 60 s.
4. Ficha de producto: producto y ajustes en paralelo (`Promise.all`).
5. `CATALOG_CACHE_SECONDS` (solo pruebas: 1 s). Producción usa 60 s.

## 6. Métrica después
- **Local** (servidor de producción + Supabase local, 9 muestras tibias): `/tienda` 47 ms (frío 87), ficha 24–29 ms (frío 15–53), carrito 17 ms. La latencia a la base local es ~1 ms, así que esto prueba el efecto de la caché y del paralelismo (frío → tibio: −30 a −45 % por consulta evitada), **no** el tiempo que verá el usuario.
- **Producción: pendiente de medir tras el despliegue** (no se ha desplegado). No se declara mejora en producción sin esa medición.

## 7. Impacto esperado (a confirmar en producción)
Con caché tibia la ficha deja de pagar el viaje Virginia → Oregón por consulta; el esqueleto da respuesta visual en el mismo clic; el shell no se recalcula entre páginas del Shop.

## 8. Riesgos
- **404 real con esqueleto (resuelto)**: un `loading.tsx` hace que la página se transmita y el código HTTP salga en 200 aunque se llame `notFound()` dentro (comprobado: producto y categoría inexistentes devolvían 200 + noindex, incluso para Googlebot). Solución: la existencia del producto/categoría/subcategoría se valida en un `layout.tsx` del propio segmento (lectura cacheada, sin consulta extra) que queda **por encima** del `loading.tsx`; el esqueleto se conserva y ahora producto, categoría y ruta inexistentes responden **HTTP 404** para navegador y buscador (`tests/e2e/status-check.mjs`). Para que esto funcione no hay `loading.tsx` en `/tienda` (cada segmento tiene el suyo: catálogo en `(catalogo)`, listas en `(lista)`, producto, carrito).
- Caché de hasta 60 s para cambios hechos fuera de la app (SQL, script `import-excelenter`).
- No se tocó RLS: las lecturas cacheadas usan el cliente público (solo datos visibles para cualquiera).

## 9. Qué NO fue necesario cambiar
Cloudinary (las imágenes ya salen con `f_auto,q_auto,w_*` y `loading="lazy"`; tarjetas a 480 px, ficha a 900 px), diseño, Manrope, RLS, flujo de negocio, Mercado Pago, `next/image` (no se usa a propósito). No se midió el bundle con herramienta; no se encontró en el código ninguna dependencia pesada cargada en el Shop (no hay Framer Motion, mapas ni editores).

## 10. Recomendaciones futuras
1. **Alinear regiones** (prioridad alta): mover las funciones de Vercel a `pdx1` (`vercel.json` → `"regions": ["pdx1"]`) o la base a la costa este. Para páginas con sesión (varias consultas en cadena) gana; para páginas públicas cacheadas pierde ~70 ms de ida y vuelta desde Colombia. Probar con un despliegue de vista previa y medir antes de decidir.
2. Medir en producción tras desplegar (misma tabla) y, si el tiempo del `/tienda` sigue >600 ms, partir el catálogo en Suspense (banner/filtros primero).
3. Medir Lighthouse móvil con throttling (Slow 4G + CPU 4×) en un dispositivo real: **no se ejecutó en esta auditoría**.
4. Análisis de bundle (`@next/bundle-analyzer`) si el JS inicial del Shop supera lo esperado: **no medido**.

## Fases no ejecutadas (honestidad)
Lighthouse/PageSpeed, Fast 3G/Slow 4G con throttling de CPU, React Profiler y análisis de bundle **no se ejecutaron**. Lo medido: TTFB real en producción, TTFB local antes/después de la caché, revisión estática de consultas, Link/prefetch, imágenes y E2E completo.

PERFORMANCE STATUS: **NEEDS WORK** (cambios listos y probados; falta medir en producción tras desplegar y decidir la región)

| Área | Antes | Después | Estado |
|---|---:|---:|---|
| Shop (`/tienda`) | 0,86–1,10 s (prod) | 47 ms tibio local; prod sin medir | Pendiente de medir en prod |
| Producto | 0,61–0,84 s (prod) | 24–29 ms tibio local; prod sin medir | Pendiente de medir en prod |
| Producto → Producto | espera sin feedback | esqueleto inmediato + shell fijo | Mejorado (percepción); medir en prod |
| Carrito | 0,59–0,62 s (prod) | 17 ms local; prod sin medir | Pendiente de medir en prod |
| Mobile | sin feedback al clic | esqueleto + barra inferior estable | Lighthouse/throttling no ejecutado |
| Desktop | igual | igual + esqueleto | Sin regresiones en E2E |
