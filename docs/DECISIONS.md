# Decisiones

## D-001 — Proyecto Supabase de TechnoUltra (ABIERTA, bloquea Fase 1)

Se pidió verificar `https://agosikmonvjujxzokdlc.supabase.co`. No se pudo: ese ref no aparece ni con el conector de Supabase
(error de permisos) ni con el `SUPABASE_ACCESS_TOKEN` del entorno (solo ve el proyecto "Brivia", ajeno a TechnoUltra).
Es probable que pertenezca a otra cuenta/organización. **No se ha tocado ningún proyecto.** Opciones: (a) autorizar la cuenta correcta,
(b) crear un proyecto nuevo de TechnoUltra, (c) darme otro token con acceso a ese proyecto.

## D-002 — Estructura del repo

El prototipo de Claude Design se movió a `design/` (referencia, excluido de lint/format). La app está en la raíz.

## D-003 — CSP

Una CSP con nonce obliga a render dinámico. Se aplicará en `proxy.ts` para rutas autenticadas (Fase 2) y se valorará una política
estática estricta para páginas públicas/SEO (Fase 14), para no perder rendimiento ni caché.

## D-004 — Íconos

El diseño usa la fuente Material Symbols por CDN. En producción se usarán SVG/íconos autoalojados (PWA offline y privacidad).

## D-001 — RESUELTA (2026-10-05)

Proyecto Supabase de TechnoUltra: `agosikmonvjujxzokdlc` ("App-technoultra", us-west-2, Postgres 17, creado 2026-10-05).
Vinculado con la CLI (`supabase link`) usando el login de la cuenta dueña. La variable de entorno `SUPABASE_ACCESS_TOKEN` del sistema
apuntaba a otra cuenta y tiene prioridad sobre el login: hay que quitarla o usar `env -u SUPABASE_ACCESS_TOKEN` al ejecutar la CLI.
`supabase migration list --linked`: sin migraciones remotas (proyecto nuevo).

## Decisiones de la Fase 1 (2026-10-05)

- **D-010 Ticket nace en "Recibido".** Los 9 estados oficiales empiezan en Recibido; la etapa previa (solicitud/recogida programada del prototipo) vive en `service_requests` y se convierte en ticket al recepcionar el equipo.
- **D-011 Cliente ≠ perfil.** `customers` es la ficha comercial; `profile_id` es nulo para clientes de mostrador (sin cuenta). Se vincula después por un proceso administrativo (nunca automáticamente por correo no verificado).
- **D-012 Rol solo en `profiles.role`**, leído siempre desde la BD. Nunca desde JWT/metadatos. Alta pública = `client`. Personal: `admin_provision_staff` (solo `service_role`, tras validar al solicitante en servidor).
- **D-013 Guardas = triggers SECURITY INVOKER** que usan `private.is_privileged_session()` (current_user postgres/service_role). Las funciones SECURITY DEFINER del proyecto corren como postgres, por lo que pueden cambiar columnas protegidas; PostgREST no.
- **D-014 Grants por columna** (anti mass-assignment) + RLS por fila. Ninguna tabla otorga DELETE al cliente salvo `product_service_links`, `push_subscriptions`, `quote_items`; el borrado de negocio es lógico (`deleted_at`).
- **D-015 Dinero.** Totales de cotización los calcula un trigger; el precio del catálogo se impone salvo permiso `pricing.override`. Pagos/eventos/documentos/firmas solo los escribe el servidor. Un pago aprobado es final.
- **D-016 Cobertura.** `coverage_areas` por código DANE (Cali 76001, Palmira 76520, Jamundí 76364, Yumbo 76892). Modalidades físicas (store/pickup/home) exigen dirección propia en municipio activo; `remote` es nacional.
- **D-017 Políticas SELECT de la propia tabla** evalúan columnas directamente: una función STABLE no ve la fila recién insertada en `INSERT … RETURNING`.
- **D-018 Auditoría.** Cadena SHA-256 con bloqueo consultivo (serializa escrituras de auditoría; aceptable al volumen esperado). Registro por trigger en tablas críticas, modo `keys` para PII y `values` para precios/estados.
- **D-019 Validación local sin Docker.** Se usa PGlite (Postgres 17 WASM) con emulación de roles `anon/authenticated/service_role` y `auth.uid()`. Pendiente confirmar en el remoto tras `db push`.

## Decisiones de la Fase 2 (2026-10-05)

- **D-020 Códigos de verificación.** Se usa el OTP nativo de Supabase Auth (6 dígitos, generado en servidor, un solo uso, expira a los 10 min, límites propios) mediante plantillas de correo con `{{ .Token }}`. Capa adicional: limitador en BD (`check_rate_limit`) por IP y por correo, que falla cerrado.
- **D-021 Registro de clientes.** Correo + contraseña (mín. 10, mayúscula/minúscula/número) con verificación por código, o Google OAuth (PKCE). El celular pasa a ser dato del onboarding (el diseño original lo pedía en el registro con OTP por SMS; se evita SMS por costo y porque no fue solicitado).
- **D-022 Proxy (Next 16).** `src/proxy.ts` refresca sesión (`getClaims`, valida firma del JWT), aplica CSP con nonce y redirige rutas protegidas. Autorización real: `requireRole` en layouts + `assertRole` en acciones + RLS. Como el nonce exige render dinámico, todo el sitio es dinámico (ver D-003; las páginas públicas de SEO podrán usar una política distinta en la Fase 14).
- **D-023 Anti open-redirect.** Todo `next`/`redirectTo` pasa por `safeNext` (solo rutas internas; rechaza `//`, `\`, esquemas, controles y versiones codificadas).
- **D-024 Anti-enumeración.** El registro y la recuperación responden igual exista o no el correo; el login devuelve un mensaje genérico.
- **D-025 Personal.** Sin registro público. El administrador invita (`inviteUserByEmail`) o promueve una cuenta existente; `admin_provision_staff` (solo `service_role`) vuelve a verificar que el actor sea admin activo. Primer administrador: `scripts/bootstrap-admin.mjs` → `bootstrap_first_admin` (una sola vez).
- **D-026 Onboarding.** Pasos en `profiles.onboarding_step` (backend, reanudable). La finalización solo ocurre con `complete_onboarding()` (valida celular y aceptación de todos los documentos legales publicados). El permiso de notificaciones guarda el resultado REAL del navegador; un error o falta de soporte nunca cuenta como concedido.
- **D-027 Dirección fuera de cobertura.** Se permite guardar una ciudad "otra" con DANE `00000` (solo soporte remoto). Pendiente: catálogo completo de municipios para validar mejor.
- **D-028 Íconos y fuentes autoalojados.** Se reemplaza Material Symbols (CDN) por SVG en `src/components/ui/icons.tsx`; Manrope vía `next/font`.

## Decisiones de las Fases 3–14 (2026-10-05, tomadas de forma autónoma; revisar en el informe final)
- **D-030 Cotización: una abierta por ticket** (índice único parcial); revisar crea nueva versión y deja la anterior "reemplazada". El cliente solo envía "qué decide" (aprobar/rechazar/preguntar); el servidor valida dueño, estado y vigencia.
- **D-031 Rechazo de cotización cancela el ticket** con motivo (comportamiento del prototipo), registrado en historial y auditoría.
- **D-032 Documentos:** PDFs con `pdf-lib` (sin dependencias nativas), almacenados en bucket privado con SHA-256; la firma ata al hash vigente; una corrección = versión nueva (la firmada se conserva). Firmables: recepción, cotización, entrega.
- **D-033 Evidencias:** Cloudinary con `type=authenticated`; el servidor firma la subida, verifica el activo por la API de administración y recién entonces inserta (el cliente no tiene INSERT). Miniaturas con URL firmada ≤ 1 h.
- **D-034 IA:** Gemini en servidor con salida JSON validada; si falla, respaldo por reglas que sigue siendo "preliminar". Todo diagnóstico exige validación humana para dejar de estar "pendiente".
- **D-035 Tienda:** el stock se **reserva al crear el pedido** (24 h configurables) y se libera al cancelar/vencer; entrega a domicilio solo con cobertura (regla conservadora configurable); fuera de cobertura solo "recoger en local". El pago "aprobado" solo lo establece el webhook verificado o un administrador (pago manual auditado).
- **D-036 Instalación con pedido:** se marca `needs_installation`; administración crea el ticket (automatizar es pendiente).
- **D-037 Soluciones digitales:** al "recibir" una solicitud digital nace un proyecto simple (no ticket); sin PM avanzado.
- **D-038 PWA:** service worker conservador (solo estáticos inmutables y página offline; nunca HTML autenticado ni datos); actualización controlada por el usuario.
- **D-039 SEO:** páginas públicas de servicios, ciudades con cobertura ACTIVA y soporte remoto, con JSON-LD; `LocalBusiness` solo si el administrador carga una dirección real. El sitio `technoultra.com` (Hostinger) queda intacto: revisar canonicals si ambos indexan contenido similar.
- **D-040 Correos:** cola con reclamo atómico; tipos importantes únicamente; respeta preferencia; sin Resend configurado no se envía y los avisos siguen en la app.
- **D-041 Navegación móvil de cliente:** 5 destinos + pantalla "Más" para mantener objetivos táctiles ≥ 44 px.
- **D-042 Carrito en localStorage:** solo ids y cantidades (no sensible); el servidor recalcula todo.

## Decisiones comerciales definitivas (2026-10-05, dictadas por el propietario; migraciones 22–23)
- **D-050 IVA:** hoy TechnoUltra es persona natural NO responsable de IVA: no se suma ni se muestra. La configuración vive en `app_settings` (`tax.vat_responsible`, `tax.vat_rate`=19, `tax.prices_include_vat`=true), se edita en `/b/comercial` y queda auditada. El precio publicado/ingresado es SIEMPRE el precio final; si pasa a ser responsable, el IVA se **desglosa** del total (informativo: $100.000 → base $84.033,61 + IVA $15.966,39) y los precios no se tocan. `quote_items.tax_rate` se fuerza a 0 (nunca se suma IVA encima).
- **D-051 Recargo por urgencia:** tabla `urgency_levels` (porcentaje, valor fijo, mínimo, días, horario —puede cruzar medianoche—, modalidades y servicios a los que aplica; sin servicios = todos). Nacen: Normal (activo, 0 %) y Prioritaria/Urgente/Emergencia **inactivas y en 0 %** hasta que administración defina valores (no se inventaron porcentajes). Se elige al cotizar (`set_quote_urgency`) y se **congela** en `quotes.urgency_snapshot`.
- **D-052 Domicilio:** concepto independiente del servicio (`quotes.delivery_fee` + snapshot). La tarifa sale de `coverage_areas.home_fee`: Cali $15.000, otros municipios con cobertura $25.000 (datos iniciales de la migración 22, editables en Cobertura). La tarifa de recogida no se definió y queda en $0. También alimenta el envío de pedidos de la tienda.
- **D-053 Diagnóstico abonable:** servicios con `is_diagnostic_fee` (todos los "Diagnóstico …" a precio fijo). El pago del diagnóstico (`record_diagnosis_payment`, solo servidor/admin, monto desde el snapshot del ticket) crea un crédito en `diagnosis_credits`. Al cotizar, el crédito se descuenta de lo que no es el propio diagnóstico (más recargos y domicilio); se **consume al aprobar** la cotización (una sola vez; el libro es inmutable) y si el cliente rechaza queda cobrado sin abono. La condición se muestra al cliente antes de pagar (catálogo y solicitud) y en la ficha del ticket.
- **D-054 "Diagnóstico de red" duplicado:** las dos filas del Excel eran el mismo servicio (mismo precio $89.900, modalidad, alcance y fuente). Se conserva Diagnóstico y Soporte › Diagnóstico › "Diagnóstico de red"; el duplicado de Redes y Wi-Fi se **archiva** (no se borra; reversible con la sentencia documentada en la migración 23) solo si coincide y no tiene historial.
- **D-055 Snapshots:** cotizaciones (`urgency/delivery/tax_snapshot`, crédito y total), pedidos y pagos (`pricing_snapshot` con la condición fiscal del momento) conservan lo vigente al operar; cambiar tarifas, recargos o IVA después no altera históricos. El PDF de la cotización y las vistas de cliente/personal usan el mismo desglose (`src/lib/domain/pricing.ts`).
- **Pendiente de esta línea:** cobrar el diagnóstico con Mercado Pago (hoy solo pago manual por administración, porque `begin_payment` es de pedidos) y desglosar IVA en pedidos de la tienda cuando se active el régimen.

## Verificación de correo y onboarding (2026-10-05)
- **D-056 Verificación por ENLACE:** el correo real de Supabase (plantilla por defecto del proyecto) trae un enlace, no un código. La app deja de mostrar un campo de 6 dígitos: `/verificar` es "Revisa tu correo" (reenvío con cooldown de 60 s además del límite en servidor, aviso de Spam/Promociones, "Ya confirmé / Usar otro correo") y, mientras está abierta, consulta la sesión cada 5 s: si se confirma en otra pestaña del mismo navegador, redirige sola. Quien ya tiene sesión y vuelve a `/verificar` va a `/` (onboarding o su inicio). Se retiró `verifyOtpAction`; el mecanismo (PKCE + `/auth/callback`) no cambió.
- **D-057 Callback exacto en todos los correos:** el reenvío de confirmación y la recuperación de contraseña también usan `redirectTo = /auth/callback` (antes caían en `/?code=`); el destino (`/restablecer`) viaja en la cookie `tu_next`. Enlace vencido/usado → `/login?error=link`; abierto en otro dispositivo (sin verificador PKCE) → mismo aviso; Google sin cookie válida → `oauth`.
- **D-058 Onboarding responsive:** contenedor propio (`src/app/onboarding/shell.tsx`): móvil una columna, tablet más ancha, escritorio de dos zonas (hasta ~1180 px) con una composición ilustrativa del proceso (marcada "Ejemplo", sin datos reales). La clase `.pt-safe` anulaba el padding vertical: la safe-area va ahora en `<main>` y el espaciado en el contenedor interior (también en `AuthShell`).
