# SHOP (tienda pública de TechnoUltra)

Catálogo de productos de proveedor (ver `docs/EXCELENTER-CATALOG.md`), con carrito y cierre **por WhatsApp**. No hay cobro en línea de estos productos.

## Pantallas
- `/tienda`, `/tienda/categoria/<categoría>[/<subcategoría>]`, `/tienda/producto/<slug>`, `/tienda/carrito` (públicas, sin cuenta).
- **Escritorio:** banner (si hay uno activo), franja «Envíos TechnoUltra», filtros a la izquierda (categorías con subcategorías, marca, precio) y rejilla de 4 columnas.
- **Móvil:** cabecera compacta, banner compacto, categorías con scroll horizontal, fila `[Filtros] [Ordenar]` (hojas inferiores) y rejilla de 2 columnas con tarjetas bajas: se ven productos desde la primera pantalla.
- **Tarjeta:** imagen de proporción fija, marca, nombre (2 líneas), precio, «● Disponible» y `+ Agregar`. No hay «Consultar por WhatsApp» en la tarjeta.
- **Ficha:** precio, «1 unidad disponible» + «Disponibilidad y precio sujetos a confirmación por WhatsApp», `Agregar al carrito` y, como secundario, consulta de ese producto por WhatsApp.

## Carrito
- Solo se guardan **ids y cantidades** en el navegador (`technoultra-shop-cart-v2`, tope 30 líneas y 5 unidades por producto). Nombre, imagen y **precio vigente** se consultan al servidor (`/api/tienda/carrito`, RLS: solo productos visibles). Un producto agotado u oculto desaparece solo.
- Contador en el encabezado, persistente entre páginas y pestañas; cantidades, eliminar, subtotal y «Entrega sujeta a confirmación de ubicación» con las dos tarifas.
- **Comprar por WhatsApp** abre UN mensaje con todos los productos (referencia, precio publicado, cantidad), subtotal y «Entrega: Pendiente de confirmar». El precio publicado ya es el precio comercial: no se pregunta «precio actual». **Seguir explorando el catálogo** vuelve a `/tienda`.

## Domicilio
Franja informativa: Cali urbano y fuera del perímetro/zonas aledañas (tarifas editables en el CRM; por defecto $10.000 y $20.000), «sujeto a validación de dirección». No se cobra en la app y es independiente de las tarifas de servicios técnicos. Ver `docs/PRODUCT-SHIPPING.md`.

## Administración (SUPERADMIN) · `/b/tienda/shop`
- **Banners** (tabla `shop_banners`): activo, título, subtítulo, imagen (https), botón + enlace (ruta interna o https), estilo (oscuro / naranja / claro, no colores libres), prioridad y fechas. El público solo ve los activos y vigentes (RLS); sin banner activo no se muestra nada.
- **Ajustes** (`shop_settings`, una fila): título y subtítulo, destacados, franja y tarifas de envío, textos del mensaje de WhatsApp (introducción y cierre).
- **Categorías:** orden, visibilidad y «destacada». **Productos:** destacado y orden (ficha del producto).
- La identidad (Manrope, #FF8A00/#FF9F2A, negro) no es editable: el CRM solo elige entre estilos permitidos.
- Migraciones: 36 (`shop_config`) y 37 (política de lectura). Pruebas: `tests/db/shop-config.test.ts`, `tests/unit/shop-flow.test.ts`, E2E `07`.
