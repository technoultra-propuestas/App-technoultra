# Escritorio, local/domicilio, equipos, direcciones y navegación (2026-10-13)

Sin migraciones: todo reutiliza el esquema existente (`services.allowed_modalities`, `coverage_areas.home_fee`, `quotes.delivery_fee/delivery_snapshot`, `set_quote_delivery`, `equipment`, `addresses`, `service_requests.service_snapshot`).

## Causas raíz
| Síntoma | Causa raíz |
| --- | --- |
| «¿Cómo quieres el servicio?» solo mostraba «Llevar al local» | **Es configuración del catálogo, no un error de código**: «Mantenimiento PC gamer» tiene `allowed_modalities = {store}`. En producción 77 servicios son solo-local y 64 admiten domicilio. El selector mostraba únicamente lo permitido y no explicaba nada. Para habilitar domicilio en un servicio, el SUPERADMIN marca «A domicilio» en *Servicios → editar → Modalidades disponibles* (no se cambió ningún servicio ni precio). |
| Sin salida al abrir un PDF | El PDF se abría como archivo suelto en una pestaña nueva (`target=_blank` a `/documentos/<id>`): ahí no existe la app. Además `X-Frame-Options: DENY` y `frame-ancestors 'none'` impedían mostrarlo dentro de la app. |
| Equipos/direcciones solo existentes | La solicitud obligaba a ir a otra pantalla (con retorno) para crear un equipo o una dirección. |
| Domicilio invisible para el cliente | La cotización ya tenía el concepto aparte, pero lo agregaba el personal a mano y el cliente no veía el valor antes de enviar. |
| Pantallas «móvil ampliado» | Contenedores de 520–680 px y formularios de una sola columna en pantallas de escritorio (solicitud, alta de equipo, documento, cotización, alta de servicio/ticket, comercial, seguridad). |
| Desbordes horizontales en el móvil del personal | Cuadrículas sin `minmax(0,1fr)` (`/b`, `/b/servicios`, `/b/usuarios`): un texto largo ensanchaba la pantalla. |

## Servicio a domicilio y su tarifa
- **Fuente de verdad:** `coverage_areas.home_fee` por municipio (el SUPERADMIN la edita en *Cobertura*). El envío de productos del Shop es otro concepto (`shop_settings.shipping_*`).
- **Selector:** «Llevar al local» y «Servicio a domicilio» siempre visibles; la que el servicio no admite aparece deshabilitada con el motivo. Recogida y remoto solo si el servicio las admite (`src/lib/domain/delivery.ts`).
- **Antes de enviar:** al elegir domicilio se muestra el valor de la zona de la dirección («Domicilio en Cali: $15.000. Se cobra aparte…»). Sin tarifa configurada (0) **no se inventa un valor ni se dice «gratis»**: «lo confirmaremos antes de que aceptes la cotización». Fuera de cobertura: se explica y no se deja enviar (el servidor también lo rechaza).
- **En la solicitud:** el servidor guarda el estimado en `service_requests.service_snapshot.delivery` (tarifa, ciudad, si estaba configurada). El navegador nunca envía un importe.
- **En la cotización:** al crearla para un ticket a domicilio, `ensureQuoteDelivery` llama a `set_quote_delivery` (valor de la cobertura de la dirección del ticket) y el domicilio entra como línea «Domicilio · Ciudad», **separada** del servicio. El total lo calcula la base de datos. Si la zona no tiene tarifa, no se cobra nada y se avisa al personal; **no se envía** una cotización a domicilio sin domicilio salvo una cortesía explícita («Enviar sin cobrar domicilio»).
- **Hallazgo pendiente (no se tocó, toca pagos):** el flujo antiguo del carrito en la app (`/c/carrito` y `create_order`) usa `coverage_areas.home_fee` como envío de productos, es decir, comparte la tarifa con el domicilio técnico. El Shop público (WhatsApp) no. Convendría desacoplarlo con una migración aparte.

## Equipos y direcciones en el mismo formulario
- `quickCreateEquipment` / `quickCreateAddress` (`src/app/c/solicitar/inline-actions.ts`): acciones de servidor, dueño = cliente de la sesión, RLS, límite de intentos y **deduplicación** (un registro idéntico creado hace < 10 min se reutiliza; además hay una guardia inmediata contra el doble clic). El registro queda seleccionado sin reiniciar el formulario; lo escrito se conserva al cambiar de modalidad o de pestaña.
- Todos los tipos de equipo del modelo (portátil, escritorio, todo en uno, impresora, red, otro). Direcciones: nombre, ciudad/municipio, dirección, barrio e **indicaciones de acceso** (`addresses.notes`, ya existía). Se conservan todas las direcciones del cliente.
- Una dirección fuera de cobertura se puede guardar pero **no habilita domicilio**. La base de datos exige dirección para toda modalidad no remota (regla existente).

## Navegación
- Visor de documentos dentro de la app: cliente `/c/documentos/<id>/ver`, personal `/b/documentos/<id>`: cabecera, «Volver a…», «Abrir en una pestaña nueva», «Descargar» y el PDF incrustado. El PDF sigue saliendo de `/documentos/<id>` (RLS, sin URL de almacenamiento); solo esa ruta permite incrustación **del mismo sitio** (`X-Frame-Options: SAMEORIGIN` + `frame-ancestors 'self'`); el resto de la app sigue en `DENY`.
- `?from=` lleva el origen (validado con `safeReturnTo`, solo rutas internas): ticket, cotización, lista. Sin origen (URL directa o pestaña nueva) hay un destino por defecto fiable; no se usa `history.back()`. Las listas de tickets/documentos pasan su búsqueda y filtros para volver sin perderlos.
- Flecha «Volver» (`BackLink`) agregada a las pantallas de detalle/creación que no la tenían (solicitud, pedidos, ajustes del personal, formularios de servicio/producto/ticket, etc.).

## Escritorio (y cómo se protegió el móvil)
Todos los cambios usan clases `lg:` (≥1024 px): el móvil conserva su composición y su orden en el DOM; la tableta queda en una columna. Solicitud: resumen a la izquierda y formulario a la derecha (dos columnas de campos); alta de equipo; documento (información + firma); cotización (detalle + PDF y decisión); «Más»; formularios de servicio y de ticket de mostrador; configuración comercial; seguridad. El panel del cliente sube de 1040 a 1180 px de ancho útil. Las pantallas del personal ya eran de escritorio (ver `tests/e2e/audit-desktop.mjs`, 144 capturas PC/tableta/móvil).

## Pruebas
`delivery.test.ts`, `quote-delivery.test.ts`, `inline-actions.test.ts`, navegación en `install-sign-flow.test.ts` y E2E 21 (recorridos A–E).
