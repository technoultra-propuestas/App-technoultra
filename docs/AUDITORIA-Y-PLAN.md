# TechnoUltra — Auditoría técnica y plan de producción

Fecha: 2026-10-04 · Alcance: lectura únicamente. No se modificó ningún archivo de diseño ni de código.
Base auditada: export de Claude Design en esta carpeta (`TechnoUltra App.dc.html` 1953 líneas / 359 KB, `TechnoUltra Mockups.dc.html` 852 líneas, `Accesos.dc.html`, `support.js`, `image-slot.js`, assets y uploads).

Limitaciones de esta auditoría (declaradas):

- Leí completos: el bloque `<script>` de la app (líneas 1424-1760 y puntos clave hasta 1953) y las constantes, datos semilla y acciones. El template (líneas 1-1423) lo audité por búsqueda dirigida (rutas, aria, safe-area, etc.), no pantalla por pantalla. La revisión visual/móvil real requiere abrir la app en dispositivos; aquí está marcada como "por verificar".
- `TechnoUltra Mockups.dc.html` y las dos imágenes de referencia (`ref_image-*.png`) no se analizaron en detalle.
- No existe repositorio git, `package.json`, ni `AGENTS.md` dentro de `App-tecnhoultra` (el `AGENTS.md` del workspace padre es una plantilla genérica de agente, sin reglas de producto). El grafo de codebase-memory no tiene este proyecto indexado.

---

## A. ESTADO ACTUAL DEL PROYECTO

TechnoUltra hoy es un **prototipo de diseño de alta fidelidad**, no una aplicación. No es Next.js, ni TypeScript, ni tiene backend. Es un único archivo `.dc.html` que se ejecuta con el runtime propio de Claude Design (`support.js`, 69 KB, "GENERATED, do not edit"), con una plantilla declarativa (`<x-dc>`, `<sc-if>`, `<sc-for>`, `{{ }}`) y una clase `Component extends DCLogic` con estado React.

El diseño es amplio y coherente: 3 experiencias (cliente, técnico, administración), 9 estados de ticket, cotización, recepción con fotos, diagnóstico, checklist, entrega con garantía y mantenimiento, CRM, agenda, tienda, servicios digitales, onboarding, seguimiento público. Es una buena referencia visual/UX y cubre casi todo el flujo de negocio.

Conclusión: **la UI/UX está avanzada; el 100% de la lógica de negocio, datos, autenticación y seguridad es simulado y hay que construirlo.**

## B. ARQUITECTURA ACTUAL

- Un archivo, un componente (`class Component`, ~530 líneas de script) con todo el estado en `this.state`: `data` (BD simulada), `session`, `route`, `params`, `stack`, `cart`, `req`, `form`, `ui`.
- Navegación: no hay router; `route` es un string en el estado (`c/home`, `b/ticket`...) con pila propia (`go`/`back`/`tab`). No hay URLs reales por pantalla (solo hash de atajos).
- Persistencia: `localStorage['technoultra-app-v1']` guarda TODO (datos, sesión, carrito, ruta).
- Estilos: CSS en línea dentro de la plantilla; no hay Tailwind ni sistema de componentes. Fuentes Manrope y Material Symbols Rounded desde Google Fonts CDN. Escala responsive con `zoom` CSS.
- Reutilización: no hay componentes; la UI está repetida por pantalla en HTML en línea. La lógica (CAT, PRODS, ST, CHECK, PAYS, CRMST, EVT, WOPTS...) sí está bien separada en constantes, lo que facilita migrar.

## C. PANTALLAS EXISTENTES (rutas internas)

Públicas: `welcome`, `login`, `register`, `otp`, `recover`, `newpw`, `onb` (onboarding, 5 pasos), `track` (seguimiento público por código), `staff` (login del equipo), `splash`.

Cliente (`c/`): home, services, category, service, req (solicitud en 5 pasos), req-done, tickets, ticket, quote, quote-done, devices, device, device-new, maint (agendar mantenimiento), warranties, warranty, docs, store, product, cart, checkout, order, notifs, profile, settings, help, more.

Backoffice (`b/`): home, tickets, ticket, new (crear ticket), reception, diagnosis, quotes, delivery, customers, customer, devices, crm, agenda, warranties, docs, store (pedidos), catalog (catálogo y precios, solo admin), reports, settings (usuarios y configuración, solo admin), notifs, more. Modales: `additem`, `crm`, `evt`.

## D. RUTAS EXISTENTES

No hay rutas HTTP. Solo atajos por hash en `Accesos.dc.html`: `#cliente`, `#tecnico`, `#admin`, `#crm`, `#agenda`, `#onboarding`, `#equipo`. **Estos hashes inician sesión directamente como cualquier rol sin credenciales** (solo válido para demo; debe eliminarse en producción).

Rutas faltantes para producción: todas las URLs reales (`/tickets/[id]`, etc.), `/legal/*`, `/auth/callback`, `/api/*` (IA, webhooks de pago, documentos), manifest, páginas de error 403/404, sesión expirada.

## E. FUNCIONALIDADES REALES

Prácticamente ninguna es real a nivel de sistema. Lo que sí es real y reutilizable:

- Reglas de negocio ya modeladas: máquina de estados de ticket, instantáneas de precio/garantía por línea de cotización (`mk()` copia nombre, precio y garantía: patrón correcto), checklist de 18 puntos, 7 componentes de diagnóstico, 9 tipos de foto (4 obligatorias), accesorios y daños, modalidades (local, recogida, domicilio, remoto), 7 estados CRM, 7 tipos de evento de agenda, opciones de garantía, validaciones de formulario (celular de 10 dígitos, longitudes mínimas).
- Accesibilidad base: 104 atributos `aria-*`, `:focus-visible`, botones de 44-58 px, `role=status`, `role=tab`/`checkbox`, detección online/offline (`navigator.onLine`).
- Solicitud de permiso de notificaciones del navegador (`Notification.requestPermission`) en onboarding.

## F. FUNCIONALIDADES MOCK

| Funcionalidad          | Cómo se simula                                                                                                               |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Login cliente          | `login()` acepta cualquier contraseña; si no encuentra al cliente usa `customers[0]` (Juan Pérez).                           |
| Login equipo           | `staffLogin()` valida solo que el correo exista y que la contraseña tenga ≥4 caracteres.                                     |
| Registro/OTP/recuperar | `verifyOtp()` acepta cualquier código de 6 dígitos y crea el cliente en localStorage. Nunca se envía un SMS.                 |
| IA                     | `window.claude.complete` (solo existe dentro del entorno de Claude Design). Si falla, `basicAI()` con regex.                 |
| Pagos                  | `placeOrder()`: `setTimeout(1600)` y `finishOrder()` confirma el pedido. No hay pasarela.                                    |
| Fotos                  | `demoPhotos()`/`pickPhoto()` marcan la foto como presente (`1`), sin archivo. `image-slot.js` está incluido pero no se usa.  |
| Documentos             | `b/docs` y `c/docs` son listados derivados de tickets (cotizaciones, recepciones...). No hay PDF, ni descarga, ni plantilla. |
| Notificaciones         | Arreglos en memoria (`notifs`, `staffN`). No hay push, email ni WhatsApp.                                                    |
| Usuarios/técnicos      | `addUser()`/`userSet()` editan un arreglo local. No se crea ninguna cuenta real.                                             |
| Catálogo y precios     | `catOv` (overrides) en localStorage.                                                                                         |
| Reportes               | Ruta `b/reports` calculada sobre datos locales.                                                                              |
| Ids y consecutivos     | `seq` en el cliente (`TU-2026-00009`, `COT-2026-00014`, `GAR-...`, `PED-...`): colisionan entre usuarios y son predecibles.  |
| Seguimiento público    | `track()` busca en los datos locales.                                                                                        |

## G. DATOS MOCK ENCONTRADOS

Todos en `seed()` y constantes (líneas 1426-1565), persistidos en localStorage. Los 9 clientes y sus datos (nombres, celulares, correos `@gmail.com`, direcciones de Cali) son datos de ejemplo.

| Dato                    | Dónde / cómo                                                                                    | Tabla Supabase                                                                                                                    | Relaciones                                 | Pantalla que lo consume    | Acción que lo modifica                                  |
| ----------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ | -------------------------- | ------------------------------------------------------- |
| Clientes (9)            | `seed().customers`                                                                              | `profiles` + `customers`                                                                                                          | 1:1 `auth.users`; 1:N addresses, equipment | b/customers, c/profile     | register, createCustomer, saveProfile                   |
| Equipos (10)            | `devices`                                                                                       | `equipment`                                                                                                                       | N:1 customer                               | c/devices, b/devices       | saveDevice, recepción                                   |
| Tickets (8)             | `tickets` con `history`, `checks`, `reception`, `diag`, `quote`, `delivery`, `part` incrustados | `tickets`, `ticket_status_history`, `ticket_receptions`, `diagnostics`, `diagnostic_items`, `quotes`, `quote_items`, `deliveries` | N:1 customer/equipment/technician          | casi todas                 | submitReq, createWalkin, receive, sendQuote, deliver... |
| Catálogo servicios (19) | `CAT` (precios hardcodeados, 10 técnicos + 9 digitales)                                         | `services`, `service_categories`                                                                                                  | 1:N quote_items                            | c/services, IA             | b/catalog (catSet)                                      |
| Productos (11) y stock  | `PRODS`                                                                                         | `products`, `product_categories`, `inventory` (+`inventory_movements`)                                                            | producto↔servicio de instalación (`inst`)  | c/store, b/catalog         | placeOrder, orderAdvance, catSet                        |
| Cotizaciones            | `ticket.quote`                                                                                  | `quotes`, `quote_items`, `quote_events` (versiones, preguntas)                                                                    | N:1 ticket                                 | c/quote, b/quotes          | sendQuote, approve/reject/clarifyQuote                  |
| Garantías (2)           | `warranties` y `delivery`                                                                       | `warranties` (tipo producto/trabajo)                                                                                              | origen: quote_item o order_item            | c/warranties, b/warranties | deliver                                                 |
| CRM (8)                 | `crm` con historial de contactos                                                                | `crm_tasks`, `crm_interactions`                                                                                                   | cliente, equipo, ticket                    | b/crm                      | crmSave, deliver, submitDigital                         |
| Agenda (9)              | `events`                                                                                        | `calendar_events`                                                                                                                 | ticket, crm_task, cliente                  | b/agenda                   | calMove, submitReq                                      |
| Notificaciones          | `notifs` (cliente), `staffN` (equipo)                                                           | `notifications` (+ `notification_preferences`, `push_subscriptions`)                                                              | usuario destino                            | c/notifs, b/notifs         | notify(), notifyStaff()                                 |
| Pedidos                 | `orders`                                                                                        | `orders`, `order_items`, `payments`                                                                                               | cliente, ticket (instalación)              | c/order, b/store           | placeOrder, orderAdvance                                |
| Usuarios internos (3)   | `USERS0`/`STAFF`                                                                                | `profiles.role` + `staff_members`                                                                                                 | auth.users                                 | b/settings                 | addUser, userSet                                        |
| Configuración           | `settings` (`maintMonths:6`, `ship:8000`)                                                       | `app_settings`                                                                                                                    | —                                          | b/settings, delivery       | setSetting                                              |
| Diagnóstico IA          | `ticket.ai`                                                                                     | `ai_diagnostics` (modelo, prompt versión, respuesta, estado de validación)                                                        | ticket                                     | c/req, c/ticket            | runAI                                                   |
| Proyectos digitales     | solo una fila CRM tipo `proyecto` (`submitDigital`)                                             | `digital_projects` + tareas/hitos                                                                                                 | cliente, cotización                        | **sin pantalla propia**    | submitDigital                                           |
| Reportes                | calculados                                                                                      | vistas/RPC                                                                                                                        | —                                          | b/reports                  | —                                                       |

Política: los datos semilla pasan a `supabase/seed.sql` solo para desarrollo/tests; producción arranca vacía (catálogo y precios los carga el administrador).

## H. ONBOARDING ACTUAL

Existe (`route 'onb'`, 5 pasos, `onbStep` 0-4): bienvenida y explicación, solicitud de permiso de notificaciones, y al final propone registrar el primer equipo (`onbFinish(dev)` → `c/device-new`). Se muestra tras el registro y se puede revisitar con "howto".

Problemas: no recoge datos (los recoge el registro: nombre, celular, contraseña); el permiso de notificaciones se marca "granted" aunque falle o no exista soporte (`.catch(()=>done('granted'))`); no persiste el progreso en servidor; no distingue usuarios con información ya registrada; no pide dirección ni consentimiento de datos (solo checkbox de términos sin texto ni versión). En iOS el permiso de notificaciones solo funciona con la PWA instalada.

## I. AUTENTICACIÓN ACTUAL

Ninguna real. La sesión es `{role, uid}` en `this.state.session` y localStorage, editable por cualquier persona desde las DevTools (basta con poner `role:'admin'`). Las rutas se protegen solo al decidir qué pantalla pintar. Cliente entra con celular/correo + contraseña (ficticia) y registro con celular + OTP. **No incluye Google OAuth**, que es el requisito.

## J. ROLES Y PERMISOS ACTUALES

Roles en el prototipo: `cliente`, `tecnico`, `admin` (prefijo `c/` y `b/`; `isAdm` oculta Catálogo y Configuración al técnico). Todo es ocultamiento de UI. El técnico "ve lo necesario" solo por menú. No hay permisos granulares, ni propiedad de recursos (un técnico ve todos los tickets, no solo los asignados).

## K. SUPABASE ACTUAL

Proyectos visibles en la cuenta conectada: Stylernow (inactivo), Brivia, Appstylernow (inactivo), Stylernowv1. **Ninguno es de TechnoUltra**; no se consultó ni se tocó ninguno. Hay que crear un proyecto nuevo para TechnoUltra (decisión tuya: organización, región; recomiendo `sa-east-1` por latencia con Colombia y plan Pro por backups/PITR). No existe esquema, RLS ni migraciones.

## L. INTEGRACIONES ACTUALES

Solo Google Fonts (Manrope, Material Symbols) y `window.claude.complete` (solo en Claude Design). Vercel: la cuenta conectada no tiene equipos/proyectos. No hay GitHub, Mercado Pago, email, SMS, push ni almacenamiento.

## M. SEGURIDAD (estado actual)

Crítico para producción, todo ausente por ser prototipo: autenticación, autorización, validación servidor, RLS, auditoría, rate limiting. Riesgos concretos hallados:

1. Elevación de rol trivial editando localStorage o con `#admin`.
2. Login que acepta cualquier contraseña y cae al primer cliente.
3. Consecutivos del cliente → colisiones y enumeración (`TU-2026-00001`...). El seguimiento público por código permitiría adivinar tickets; usar código no secuencial + verificación (celular/código).
4. Datos personales de 9 clientes embebidos en el HTML entregado a cualquier visitante.
5. Fuentes externas sin SRI/CSP; sin cabeceras de seguridad.
6. Prompt de IA contiene el catálogo; en producción debe ir por servidor.

## N. PROBLEMAS ENCONTRADOS

- Un solo archivo monolítico y runtime propietario (`support.js` generado): no se puede desplegar tal cual en Vercel como producto.
- Estado de negocio incrustado en el ticket (historia, cotización, diagnóstico en un blob): hay que normalizar.
- `zoom` CSS para escalar y `min-height:100vh` (en iOS Safari 100vh incluye la barra; usar `dvh`).
- `viewport` sin `viewport-fit=cover`; **0 usos de `env(safe-area-inset-*)`**, 0 `prefers-reduced-motion`, 0 haptics, sin manifest ni service worker (por búsqueda en el archivo). Hay solo 2 `@keyframes` (spin, pulse); el resto de microinteracciones faltan.
- Permiso de notificaciones reportado "granted" en errores.
- Estados de error/vacío/offline: hay `offline` y `err` globales; falta cobertura sistemática (sesión expirada, 403, 404, reintento) y los errores técnicos nunca deben llegar al usuario.
- Fuentes e iconos por CDN: sin conexión la app pierde iconos (Material Symbols es fuente de iconos → rotos en offline).
- Imagen de logo de 369 KB usada para avatares de 48-128 px: optimizar (sin cambiar el diseño).
- Dependencia de texto fijo: precios en pesos `$1.200.000` como "Desde" en servicios digitales (estimaciones, no precios finales).

## O. FUNCIONALIDADES FALTANTES

Auth real (Google OAuth, staff por invitación), RLS, almacenamiento de fotos, IA en servidor, cotizaciones con versiones, PDF de documentos, **firma digital** (no existe), **centro legal** (no existe: solo checkbox "términos"), audit logs, soft delete, pagos reales, webhooks, notificaciones reales (email/push), proyectos digitales como entidad con pantallas (hoy solo una tarea CRM), garantías separadas producto/trabajo (hoy una sola `w` por línea: sirve de base), recomendaciones de uso y acta de entrega, PWA, inventario con movimientos, reportes reales, backups, tests, CI, observabilidad.

## P. MEJORAS RECOMENDADAS

Mínimas y sin cambiar identidad visual: safe-areas en cabeceras, barra inferior y modales; `dvh`; `reduced-motion`; haptics progresivos; skeletons de carga; pantallas 403/404/sesión expirada; autofocus/teclado virtual (`scrollIntoView` en inputs); texto del permiso de notificaciones coherente con el resultado real; un único botón "Continuar con Google" en `login`/`register` (cambio visual mínimo y necesario, a validar contigo).

**Decisión de diseño a confirmar contigo:** hoy el registro del cliente es celular+contraseña+OTP. Tu requisito es Google OAuth. Propongo: Google como acceso principal; el celular pasa a ser dato de perfil en el onboarding (validación de 10 dígitos conservada); eliminar OTP/contraseña/recuperar para clientes (OTP por SMS tendría costo y no lo pediste). Eso quita 3 pantallas (`otp`, `recover`, `newpw`) del flujo del cliente.

## Q. ARQUITECTURA OBJETIVO

- **Frontend:** Next.js (App Router) + TypeScript estricto + Tailwind configurado con los tokens aprobados (Manrope, #FF8A00, #FF9F2A, #000, #121212, #F6F6F5, #5C5C59, #FFF). Migración fiel: cada pantalla del `.dc.html` → ruta + componentes, copiando estilos tal cual (se extraen primero a tokens/clases sin alterar valores). Server Components + Server Actions para mutaciones; Route Handlers para webhooks e IA.
- **Backend:** Supabase (Postgres, Auth, Storage, RLS, Edge Functions solo cuando se necesite un proceso fuera de Vercel, p. ej. cron de mantenimiento).
- **Zero trust:** `middleware` solo refresca sesión y redirige; **la autorización real** vive en RLS + comprobación de rol/propiedad en cada Server Action/Route Handler (con `getUser()`, nunca `getSession()` de cookie sin validar). Cliente Supabase con `anon key` en el navegador; `service_role` solo en servidor y solo en módulos `server-only`.
- **Roles:** `profiles.role` enum (`client`,`technician`,`admin`) + tablas `permissions`/`role_permissions` para granularidad futura. Los técnicos/admin se crean con invitación (`auth.admin.inviteUserByEmail` desde servidor, o crear usuario y forzar cambio de contraseña); el registro libre por Google solo puede producir `client` (trigger en `auth.users` fuerza `client`; sin posibilidad de elegir rol). Ningún cambio de rol por el cliente: columna protegida por RLS/trigger.
- **Dominios:** `technoultra.com` (marketing, hoy Hostinger — no se toca) y `app.technoultra.com` (Vercel) mediante un registro CNAME en Hostinger solo para `app`, tras listar los registros actuales.
- **PWA:** manifest + iconos + service worker mínimo (Serwist o `next-pwa` sucesor), caché de shell estático y página offline; sin caché de datos sensibles.

### Cloudflare — qué sí y qué no

- **No lo necesitamos para el MVP.** Vercel ya da CDN, TLS y DDoS básico; Supabase da storage con CDN y URLs firmadas.
- **Opcional más adelante:** WAF/rate limiting delante de `/api/*` y webhooks si hay abuso; Turnstile (captcha) en el seguimiento público; DNS si migras el dominio fuera de Hostinger. R2/Workers: no justificados.
- Añadir Cloudflare como proxy delante de Vercel suele traer problemas (doble CDN, certificados); no lo recomiendo salvo necesidad probada.

## R. MODELO DE DATOS PROPUESTO

Reutilizando el modelo del prototipo (no se crean tablas que no se usan). Todas con `id uuid`, `created_at`, `updated_at`, `created_by`, soft delete (`deleted_at`/`is_active`) donde afecte trazabilidad, RLS activo.

Identidad: `profiles` (1:1 auth.users: role, full_name, phone, avatar, is_active, onboarding_completed_at), `customers` (profile_id, document opcional), `staff_members` (profile_id, cargo), `addresses`, `permissions`, `role_permissions`.
Equipos: `equipment` (customer_id, type, brand, model, serial, ram, disk, year, next_maintenance_at), `equipment_history` (vista/ tabla de eventos).
Servicio técnico: `service_requests` (origen cliente/mostrador, modalidad, ventana de recogida) → `tickets` (code humano único, status enum, assigned_to, customer_id, equipment_id, problem, kind='technical'), `ticket_status_history` (de/a, by, note; insert-only), `ticket_notes`, `receptions` (accesorios, daños, observaciones, reason) + `reception_photos` (storage_path, tipo), `diagnostics` + `diagnostic_items` (componentes ok/revisar/falla), `checklist_runs`/`checklist_items`, `ai_diagnostics` (is_preliminary=true, validated_by, validated_at).
Cotizaciones: `quotes` (ticket_id|project_id, number, version, status, valid_until), `quote_items` (concepto, kind servicio|producto, qty, unit_price snapshot, discount, tax, **warranty_days**, **warranty_kind** product|labor), `quote_events` (enviada/vista/aclaración/aprobada/rechazada, by, at).
Catálogo/tienda: `services`, `service_categories`, `products`, `product_categories`, `inventory`, `inventory_movements`, `orders`, `order_items`, `product_service_links` (SSD↔instalación).
Pagos: `payments` (order_id|quote_id, provider, status, amount, currency, external_id, idempotency_key), `payment_events` (payload crudo del webhook, único por id de evento).
Garantías: `warranties` (kind product|labor, number, quote_item_id/order_item_id, start, end, coverage, terms_version_id, serial).
Documentos/firma/legal: `documents` (type, ticket/quote/order/project/equipment, number, version, status generated|sent|viewed|signed|rejected|superseded, storage_path, sha256), `document_signatures` (document_id, version, signer, signed_at, ip, user_agent, consent text hash, signature_storage_path, sha256 del documento firmado), `legal_documents` (slug, version, status, published_at, content), `legal_acceptances` (user, legal_document_id **versión**, accepted_at; insert-only).
CRM/agenda/mantenimiento: `crm_tasks`, `crm_interactions`, `calendar_events`, `maintenance_plans` (equipment, due, source delivery).
Digitales: `digital_projects` (customer, service, scope, quote_id, status, owner), `project_tasks`, `project_status_history`, `project_files`, `project_comments` — separados de `tickets` (kind técnico) pero comparten cotización, documentos y CRM.
Sistema: `notifications`, `notification_preferences`, `push_subscriptions`, `app_settings`, `audit_logs` (actor, action, resource, resource_id, before/after, result, ip, at; insert-only), `reviews` (P3).

Políticas RLS base: cliente solo `customer_id = auth.uid()` mapeado; técnico solo tickets `assigned_to = auth.uid()` (y lo necesario del cliente/equipo vía vistas); admin todo, pero con funciones `SECURITY DEFINER` auditadas para operaciones sensibles. Transiciones de estado y activación de garantía/pagos solo por RPC/server (no UPDATE directo). Storage: buckets privados con rutas `customer_id/ticket_id/...` y URLs firmadas de corta duración.

## S. INTEGRACIONES NECESARIAS

Supabase (Auth + Google provider, Storage, DB), Google Cloud (credencial OAuth), GitHub (repo privado), Vercel (proyecto + dominio), Mercado Pago (Checkout Pro + webhooks), proveedor de IA (servidor; el que elijas), email transaccional (Resend o similar, para notificaciones y documentos), Web Push (VAPID), generación de PDF (servidor: `@react-pdf/renderer` o Chromium/Puppeteer en función; decidir según tamaño y fuentes), Sentry (errores). WhatsApp (Cloud API) queda para después.

## T. VARIABLES DE ENTORNO NECESARIAS

Públicas (`NEXT_PUBLIC_*`, solo valores públicos): `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`.
Privadas (solo servidor/Vercel, nunca `NEXT_PUBLIC`): `SUPABASE_SERVICE_ROLE_KEY`, `AI_PROVIDER_API_KEY` (+ `AI_MODEL`), `MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`, `MERCADOPAGO_PUBLIC_KEY` (la pública del SDK sí puede ir al cliente si se usa Bricks), `RESEND_API_KEY`, `VAPID_PRIVATE_KEY`, `CRON_SECRET`, `SENTRY_DSN`/`SENTRY_AUTH_TOKEN`, `DOCUMENT_SIGNING_SALT`.
Se separan `development`/`preview`/`production` en Vercel. Se entrega `.env.example` sin valores. Google OAuth client id/secret se configuran en el panel de Supabase, no en el repo.

## U. PLAN DE IMPLEMENTACIÓN

Ver sección "Orden recomendado" abajo.

---

## V. DOCUMENTACIÓN Y FIRMA

Hoy: ninguna firma; los "documentos" son listados. Objetivo: tabla `documents` con ciclo generado→enviado→visto→firmado/rechazado→reemplazado, versión inmutable tras firmar (`sha256` del PDF final guardado; cualquier corrección crea versión nueva), firma manuscrita en canvas táctil (móvil) guardada en storage privado + registro `document_signatures` con usuario, fecha/hora, versión, texto de consentimiento, hash, IP/UA proporcionales (se evalúa minimizar). Documentos a firmar: recepción, autorización/aceptación de cotización, acta de entrega, aceptación de condiciones. Nota legal: una firma electrónica simple tiene valor probatorio pero no equivale automáticamente a firma digital certificada (Ley 527/1999, Decreto 2364/2012); redacción final por abogado en Colombia.

## W. LEGAL Y PRIVACIDAD

Hoy: solo un checkbox de términos, sin textos (0 apariciones de "Términos/Privacidad"). Objetivo: Centro Legal con `legal_documents` versionados (términos, política de privacidad y tratamiento de datos —Ley 1581/2012—, garantías, condiciones de servicio y compra, cancelaciones/devoluciones, consentimientos) y `legal_acceptances` inmutables por versión. Al publicar una versión nueva se pide re-aceptación sin tocar el histórico. Privacidad: mínimo de datos, fotos en buckets privados con URLs firmadas, retención definida, derechos de acceso/actualización/supresión (con límite por obligación contable/garantía), sin PII en logs, registro de la autorización de tratamiento. Textos finales revisados por abogado.

## X. ZERO TRUST

Criterios verificables: (1) ningún dato de autorización viene del navegador; (2) toda tabla con RLS; (3) `/ticket/124` de otro cliente devuelve 404/403 por RLS y por la Server Action; (4) transición de estado solo vía RPC que valida rol, propiedad y precondiciones (p. ej. "listo" exige checklist completo y cotización aprobada; "aprobar" solo en `aprobacion`); (5) validación de entradas con Zod en servidor; (6) uploads con tipo/tamaño/magic-bytes y rutas generadas por el servidor; (7) rate limiting en login, seguimiento público e IA; (8) pruebas automatizadas de RLS con dos clientes distintos.

## Y. SEGURIDAD DEL NAVEGADOR

Auditar `NEXT_PUBLIC_*`, deshabilitar source maps públicos (o subirlos a Sentry), CSP estricta (nonces), HSTS, `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` (cámara solo propia), cookies httpOnly/secure/sameSite, nada sensible en localStorage (hoy **todo** está ahí), errores genéricos al usuario y detalle solo en logs.

## Z. MERCADO PAGO

Hoy simulado (`setTimeout(1600)`). Diseño: el servidor crea la preferencia (monto calculado en servidor desde `order_items`, nunca del cliente) con `external_reference = payment.id` e `idempotency_key`; redirección a Checkout Pro; `back_urls` solo informativas; el estado `approved` lo fija únicamente el webhook tras validar la firma (`x-signature` con el secreto) y **consultar el pago por API** a Mercado Pago; `payment_events` con id único para idempotencia; estados pending/approved/rejected/cancelled/refunded/expired; conciliación por cron; "contraentrega/efectivo/transferencia" quedan como pagos manuales confirmados solo por acción de admin con auditoría. A validar con la documentación vigente de Mercado Pago Colombia qué métodos (Nequi, Daviplata, PSE, tarjetas) están disponibles en la cuenta. Credenciales: Access Token y Webhook Secret de producción y de pruebas por separado.

## AA. EXPERIENCIA NATIVA MÓVIL (hallazgos por verificar en dispositivo)

Confirmado por código: sin `safe-area-inset`, sin `viewport-fit=cover`, `100vh`, un `zoom` global, sin manejo de teclado virtual. Objetivos táctiles de 44-58 px (bien). Revisar en iPhone SE, iPhone con Dynamic Island, Android pequeño/grande, tablet y escritorio: cabeceras fijas, barra inferior, modales altos, formularios largos (recepción, diagnóstico), toasts. Corrección mínima: `padding` con `env(safe-area-inset-*)`, `dvh`, `scroll-padding`, sin cambiar medidas visibles en pantallas sin notch.

## AB. PWA

No es PWA aún (sin manifest, sin service worker). Falta: manifest (`name`, `short_name`, `display: standalone`, `theme_color #121212`, `background_color #F6F6F5`), iconos 192/512/maskable derivados del logo, iconos y fuentes autoalojados (hoy CDN), página offline, actualización controlada del service worker, `apple-touch-icon`, splash iOS, estrategia: shell cacheado, datos siempre en red (sin caché de datos sensibles), cola de reintento solo para acciones idempotentes cuando aporte valor.

## AC. HAPTICS / ANIMACIONES

Una utilidad `haptic(type)` con `navigator.vibrate` si existe (no existe en iOS Safari) y silencio como fallback; usada en éxito, error, cambio de estado. Transiciones de pantalla y modales (150-250 ms), feedback de botón, skeletons, éxito/error; todo bajo `prefers-reduced-motion`. Sin dependencias pesadas.

## AD. DOCUMENTOS AUTOMÁTICOS

Plantillas en servidor alimentadas por datos reales y disparadas por transición de estado: recibido → acta de recepción; diagnóstico → informe (IA marcada "preliminar" hasta validación del técnico); aprobación → cotización PDF y autorización; pruebas → checklist; entregado → acta de entrega + garantía producto + garantía trabajo + recomendaciones de uso + próximo mantenimiento (6 meses configurable, `settings.maintMonths` ya existe) + firma. Almacenados en Storage privado, numerados, versionados, con hash.

## AE. GARANTÍAS

Hoy hay una sola garantía por línea (`w` en días, opciones 0/30/90/180/365) y una garantía derivada por entrega. Objetivo: `warranty_kind` (producto vs trabajo) independiente por línea, número de garantía, serial, cobertura, exclusiones y documento propio; se activan solo en la transición a "entregado" (RPC) y se consultan desde el cliente.

## AF. RIESGOS DE PRODUCCIÓN

1. Reescritura grande del front (≈2000 líneas de UI en línea) con riesgo de regresión visual → mitigación: migrar pantalla a pantalla con comparación visual contra el diseño. 2) Auth/RLS mal configurados → pruebas de RLS obligatorias. 3) Pagos: webhooks idempotentes y verificación por API. 4) Legal: textos y firma requieren revisión jurídica. 5) iOS: push y haptics limitados. 6) Costos de IA y de Supabase Pro/PITR. 7) Datos de clientes reales y fotos: privacidad y retención. 8) Dependencia del runtime de Claude Design (no se despliega). 9) Un solo desarrollador/sin tests hoy. 10) Cuenta Supabase con otros proyectos: crear proyecto y claves aislados.

## AG. CRITERIOS DE GO-LIVE

Se cumplen todos antes de clientes reales: auth real (Google + staff por invitación); RLS en todas las tablas y tests de aislamiento cliente/técnico/admin; sin secretos en el navegador y `NEXT_PUBLIC_*` revisado; validación en servidor; flujo ticket→cotización→aprobación→entrega→garantía→mantenimiento probado de punta a punta; fotos en storage privado; IA en servidor con aviso preliminar; Mercado Pago con webhook verificado e idempotente (sandbox y una compra real de bajo valor); documentos reales y firma; legal publicado y aceptación versionada; onboarding; audit logs; PWA instalable (iOS y Android) con safe areas; accesibilidad básica; backups/PITR y restauración probada; Sentry y logs; deploy reproducible (CI: typecheck, lint, tests); dominio `app.technoultra.com` con HTTPS y variables de producción; páginas de error y manejo de sesión expirada.

---

# BACKLOG PRIORIZADO

Formato: ID · descripción · motivo · módulos · dependencia · criterio de aceptación · herramienta.
Los puntos del complemento ya están integrados en las tareas (sin duplicar).

## P0 — Bloqueantes

- **P0-001** Decisiones previas (Supabase org/región/plan, proveedor IA, email, nombre legal). · Sin ellas no se puede crear infra · — · ninguna · Decisiones registradas en `docs/DECISIONES.md` · conversación.
- **P0-002** Inicializar repo Next.js + TS estricto + Tailwind con tokens aprobados + ESLint + git (`.gitignore`, `.env.example`, README). · Base · raíz · P0-001 · `build`, `lint`, `tsc` pasan; fuentes/colores idénticos a diseño · Git/GitHub.
- **P0-003** Proyecto Supabase TechnoUltra + migraciones versionadas (`supabase/migrations`) + CLI local. · Backend · `supabase/` · P0-001 · migración inicial aplica en limpio · Supabase MCP/CLI.
- **P0-004** Esquema núcleo (profiles, customers, staff, equipment, tickets, history, receptions, diagnostics, quotes, items) con constraints, índices y **RLS por rol**. · Seguridad/integridad · migraciones · P0-003 · tests con 2 clientes: no ven datos ajenos; técnico solo asignados · Supabase.
- **P0-005** Auth: Google OAuth (cliente), trigger que fuerza `role=client`, invitación de técnico/admin desde servidor, sesión SSR (`@supabase/ssr`), middleware de refresco, guardas por rol. · Acceso real · `app/(auth)`, `middleware.ts`, `lib/supabase` · P0-004 · cliente entra con Google y la sesión persiste; técnico no puede registrarse; cambiar rol desde el navegador falla · Supabase Auth, Google Cloud.
- **P0-006** Eliminar atajos `#admin/#tecnico` y localStorage como fuente de verdad al migrar. · Zero trust · app · P0-005 · no existe forma de iniciar sesión sin credenciales · —.
- **P0-007** Máquina de estados de ticket en servidor (RPC/funciones) con precondiciones e historial con autor. · Integridad · migraciones, actions · P0-004 · "aprobar" fuera de `aprobacion` rechazado; "listo" exige checklist y cotización aprobada · Supabase.
- **P0-008** `audit_logs` insert-only y registro de acciones críticas. · Trazabilidad · migraciones · P0-004 · cada transición/rol/precio/eliminación genera registro · Supabase.
- **P0-009** Cabeceras de seguridad, CSP, revisión `NEXT_PUBLIC_*`, source maps. · Seguridad navegador · `next.config` · P0-002 · escaneo sin secretos en bundle · Vercel.
- **P0-010** Deploy preview en Vercel + CI (typecheck, lint, test). · Reproducibilidad · `.github/workflows` · P0-002 · cada PR genera preview verde · Vercel, GitHub.

## P1 — MVP funcional

- **P1-001** Migrar pantallas públicas y cliente (welcome, login, home, servicios, tickets, equipos, perfil...) con datos reales y estados loading/empty/error. · Cliente real · `app/(client)` · P0-005 · UI pixel-equivalente al diseño; sin datos mock · Next.js.
- **P1-002** Onboarding real (persistido, perfil, teléfono, dirección, primer equipo, permisos reales, aceptación legal versionada). · Activación · `app/onboarding` · P1-001, P1-012 · se omite si el perfil está completo · —.
- **P1-003** Equipos y direcciones del cliente (CRUD con RLS). · P1-001.
- **P1-004** Solicitud de servicio (5 pasos) persistida, agenda de recogida y evento de calendario. · Núcleo de negocio · P1-003 · crea ticket+evento+notificación · —.
- **P1-005** Recepción con fotos en Supabase Storage (privado, URLs firmadas, validación tipo/tamaño). · Evidencia real · P0-007 · fotos obligatorias exigidas por servidor · Storage.
- **P1-006** Backoffice técnico: mis tickets, diagnóstico, checklist, pruebas, cambios de estado permitidos. · Operación · `app/(backoffice)` · P0-007 · técnico solo ve asignados · —.
- **P1-007** Cotizaciones reales: crear/editar/versionar/enviar, líneas con garantía por línea, aprobar/rechazar/aclarar con evento y autor. · Core · P1-006 · aprobación cambia estado vía RPC · —.
- **P1-008** Catálogo de servicios/productos/inventario administrable (precios reales, no hardcodeados), `product_service_links`. · Datos reales · P0-004 · admin edita, cliente lee · —.
- **P1-009** Backoffice admin: clientes, técnicos (invitar/desactivar), usuarios/roles, asignación, configuración. · Control · P0-005 · todo registrado en auditoría · —.
- **P1-010** Entrega: garantías (producto/trabajo separadas), recomendaciones, próximo mantenimiento (6 meses configurable), tarea CRM y evento. · Ciclo completo · P1-007 · activación solo al pasar a "entregado" · —.
- **P1-011** CRM y agenda reales. · P1-010.
- **P1-012** Centro legal versionado y `legal_acceptances`. · Cumplimiento · migraciones, `/legal/*` · P0-004 · aceptación guarda versión; nueva versión pide re-aceptación · —.
- **P1-013** IA real en servidor: Route Handler con auth, rate limit, esquema Zod de salida, catálogo desde BD, `ai_diagnostics`, aviso "Diagnóstico preliminar..." siempre visible, nunca afirmar fallas no verificadas. · Seguridad/valor · `app/api/ai` · P1-004 · clave nunca en el bundle; respuesta validada · proveedor IA.
- **P1-014** Pagos Mercado Pago: preferencia server-side, webhook verificado e idempotente, estados, pagos manuales por admin. · Ingresos · `app/api/payments` · P1-008 · pago aprobado solo tras verificación de webhook+API · Mercado Pago.
- **P1-015** Documentos PDF reales (recepción, diagnóstico, cotización, entrega, garantías) y centro de Documentos para cliente y backoffice. · Requisito · `lib/documents` · P1-007, P1-010 · descarga con URL firmada, hash guardado · —.
- **P1-016** Firma del cliente (canvas móvil) para recepción, cotización y entrega, con versión/hash/consentimiento. · Requisito · `document_signatures` · P1-015 · documento firmado inmutable; corrección = nueva versión · —.
- **P1-017** Notificaciones internas + email transaccional para los eventos listados. · Comunicación · `notifications` · P1-004 · eventos de ticket/cotización/garantía generan notificación · Resend.
- **P1-018** PWA instalable (manifest, iconos, SW mínimo, offline page, fuentes/iconos autoalojados) + safe areas + `dvh` + reduced-motion. · App nativa · `public/`, `globals.css` · P1-001 · Lighthouse PWA instalable en iOS/Android; sin contenido bajo notch · —.
- **P1-019** Estados globales: skeletons, empty, error, 403/404, sesión expirada, offline y reintento. · UX · app · P1-001 · ninguna pantalla en blanco ni error técnico visible · —.
- **P1-020** Tests críticos: RLS, transiciones, cotización, pagos/webhook, onboarding, auth (Vitest + Playwright). · Calidad · `tests/` · P0-004 · CI los ejecuta · —.
- **P1-021** Seguimiento público seguro (código no secuencial + verificación, rate limit/Turnstile). · P0-004.
- **P1-022** Backups/PITR, política de recuperación, Sentry, logs. · Operación · Supabase, Sentry.
- **P1-023** Dominio `app.technoultra.com` (CNAME en Hostinger tras inspeccionar DNS) y variables de producción. · Go-live · Vercel/Hostinger · P0-010.

## P2 — Importante, después del MVP

- **P2-001** Tienda completa (carrito, pedidos, inventario con movimientos, instalación opcional). Hoy hay UI; conectar a BD y pagos.
- **P2-002** Proyectos digitales como entidad (tareas, avances, archivos, comentarios, entregables, historial) con pantallas propias.
- **P2-003** Reportes reales (vistas/RPC) y export.
- **P2-004** Web Push (VAPID) y preferencias de notificación.
- **P2-005** Haptics progresivos y microinteracciones completas.
- **P2-006** Permisos granulares editables en UI.
- **P2-007** Cron de mantenimiento/garantías por vencer (Vercel Cron o pg_cron).
- **P2-008** Observabilidad ampliada (métricas, alertas) y WAF/rate limiting avanzado si hay abuso.

## P3 — Futuro

- **P3-001** WhatsApp (Cloud API) con plantillas aprobadas. **P3-002** Reseñas. **P3-003** Firma digital certificada (proveedor externo). **P3-004** Cloudflare (WAF/Turnstile global) si se justifica. **P3-005** Facturación electrónica DIAN.

---

# ORDEN RECOMENDADO DE IMPLEMENTACIÓN

- **Fase 0** Auditoría y decisiones (este documento).
- **Fase 1** Base: repo, Next.js, TS, Tailwind con tokens, ESLint, GitHub, Vercel preview, CI, `.env.example`, headers (P0-002, 009, 010).
- **Fase 2** Supabase: proyecto, esquema núcleo, RLS, roles, audit logs, estados (P0-003/004/007/008).
- **Fase 3** Auth y cliente: Google OAuth, invitaciones staff, perfil, onboarding, equipos, direcciones, legal (P0-005/006, P1-001/002/003/012).
- **Fase 4** Servicio técnico: solicitud, recepción con fotos, diagnóstico, asignación, estados (P1-004/005/006).
- **Fase 5** Cotizaciones, aprobación/rechazo/preguntas, entrega, garantías, mantenimiento (P1-007/010/011).
- **Fase 6** Backoffice admin completo (P1-008/009).
- **Fase 7** IA real (P1-013).
- **Fase 8** Documentos/PDF y firma (P1-015/016) — antes de pagos porque la entrega y la cotización los requieren.
- **Fase 9** Pagos Mercado Pago (P1-014) y tienda (P2-001).
- **Fase 10** Notificaciones, PWA y experiencia móvil (P1-017/018/019).
- **Fase 11** Seguridad, pruebas, auditoría final y observabilidad (P1-020/021/022, zero-trust-review y security-review).
- **Fase 12** Dominio y producción (P1-023) + criterios Go-Live.
- **Fase 13** P2: proyectos digitales, reportes, push, haptics.

Nota: el orden difiere del sugerido en dos puntos justificados por la auditoría: documentos+firma antes de pagos (la cotización/aprobación y entrega los necesitan), y PWA/safe areas se aplican desde la Fase 1 en el layout base para no retrabajar.

---

# QUÉ NECESITO DE TI (sin pegar secretos en el chat)

1. **Supabase** — crear proyecto TechnoUltra: lo puedo hacer con el conector de Supabase ya autorizado en esta sesión una vez confirmes organización, región y plan (puede generar costo). Aviso: el conector del proyecto local `supabase` falló por token inválido (401); el de claude.ai sí responde.
2. **Vercel** — el conector está autorizado pero la cuenta no muestra equipos/proyectos; necesito que confirmes la cuenta/equipo o crees el equipo. Variables se cargan en Vercel, no en el chat.
3. **GitHub** — crear repo privado `technoultra-app` (o dime la organización); el push lo hago con `gh` previa autorización tuya. No se sube `.env`.
4. **Google Cloud** — crear credencial OAuth 2.0 (tipo web) y pegar client id/secret **directamente en el panel de Supabase → Auth → Providers → Google**, no aquí. Redirect: la URL de callback que Supabase muestra.
5. **Mercado Pago** — cuenta de vendedor Colombia; credenciales de prueba y producción se guardan solo en variables de entorno de Vercel (`MERCADOPAGO_ACCESS_TOKEN`, `MERCADOPAGO_WEBHOOK_SECRET`). No me las compartas por chat.
6. **Proveedor de IA y de email** — elige proveedor; las claves van a Vercel.
7. **Hostinger DNS** — solo lectura primero: dime los registros actuales de technoultra.com (captura) antes de añadir el CNAME de `app`.
8. **Contenido legal** — textos de términos/privacidad/garantías (o contratamos revisión legal).
