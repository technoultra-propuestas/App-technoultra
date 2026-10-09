# PRODUCTION-READINESS-REPORT — TechnoUltra

Fecha: 2026-10-08 · Producción: https://app.technoultra.com · Commit desplegado: `9d0f50f` · Supabase: `agosikmonvjujxzokdlc` (App-technoultra). **Mercado Pago NO está activado.**

## 1. Estado general
Todo lo automatizable está hecho, probado y en producción. Lo que queda es información, credenciales o decisiones que solo puede dar el propietario (sección 20) y Mercado Pago, que se deja pendiente a propósito.

## 2. Migraciones aplicadas (remoto verificado)
- Proyecto verificado antes de operar: `supabase/.temp/linked-project.json` → ref `agosikmonvjujxzokdlc`, nombre App-technoultra. No se tocó ningún otro proyecto.
- Aplicadas con `db push` (simulacro previo con `--dry-run`): **38** (pagos manuales y comprobantes), **39** (conceptos de cotización y diagnóstico finalizado), **40** (huella SHA-256 del PDF al aprobar). 40 de 40 migraciones registradas en el remoto, sin pendientes.
- Verificado en el remoto: columnas nuevas, función `record_manual_service_payment_v2`/`confirm_manual_payment`/`cancel_pending_payment` solo para `service_role`, `finalize_diagnosis`/`decide_quote` para `authenticated` (no `anon`), funciones anteriores de pago manual retiradas, política de lectura de cobros para el técnico, `evidence_slot_check` con `voucher`, enum `payment`, **0** líneas de cotización sin concepto.
- Auditoría de esquema (remoto): tablas sin RLS = ninguna; tablas con RLS sin políticas = ninguna; funciones `SECURITY DEFINER` sin `search_path` = ninguna; funciones ejecutables por `anon` = `check_coverage`, `product_stock_flags`, `track_ticket` (públicas por diseño).

## 3. Deployment
- `git push origin main` (sin force). El primer build falló en 28 s por una descarga transitoria de Google Fonts en Vercel (`next/font/google`, sin relación con el código); se re-desplegó el mismo commit y quedó **Ready** (2 min).
- Verificación en el dominio de producción: `/`, `/tienda`, `/tienda/carrito`, `/servicios`, `/login`, `/gestion/login`, manifest, robots y sitemap → 200; `/c` y `/b` sin sesión → 307 al acceso; crons sin secreto → 401; ficha, categoría y ruta inexistentes → **404**; CSP, HSTS (preload) y `X-Frame-Options: DENY` presentes.

## 4. Tests (`npm run check`)
TypeScript sin errores · ESLint 0 errores (18 avisos preexistentes de variables sin usar) · **649 pruebas** (398 unitarias + 251 de base de datos) · build OK. Se subió el tiempo máximo por prueba a 20 s (con 5 s, pruebas de PGlite/PDF daban falsos fallos al competir por CPU con el E2E).

## 5. E2E (base local reiniciada, 11 escenarios, **418 comprobaciones, 418 correctas**)
01 cliente 6 · 02 personal/MFA 19 · 03 flujo completo 48 · 04 seguridad 60 · 05 panel 133 · 06 «Enviar al cliente» 6 · 07 Shop 65 · 08 flujos del cliente 43 · 09 capturas 1 · 10 pagos/cotización/Shop 31 · 11 contraste AA 6.
Fallos intermedios que aparecieron y se corrigieron: enlace «Próxima acción» confundido con el botón del formulario (prueba), textos en mayúsculas por CSS (prueba), caché del catálogo vs cambios por SQL (prueba), y **un daño propio de codificación (acentos) en 14 archivos** tras editarlos con PowerShell — detectado por el E2E, reparado y verificado con un barrido de 228 archivos.

## 6. Sentry
- **Funcional**: el build de producción ahora dice «Successfully uploaded source maps to Sentry» (antes: `403 Forbidden` al crear el release). El token (`SENTRY_AUTH_TOKEN`) ya tiene permisos suficientes; no se imprimió ni se necesitó leerlo.
- Corregido: el release subido en el build ahora se llama igual que el que reporta el SDK (SHA de 12 caracteres); sin eso Sentry no asocia los source maps a los errores aunque el token funcione.
- Entorno `production` (`VERCEL_ENV`), DSN público como variable `config`, sin Session Replay, datos personales depurados (`lib/sentry-scrub.ts`, probado).
- No verificado: llegada de un error real al panel de Sentry con el release nuevo (requiere abrir Sentry); y reglas de alerta por correo (se crean en la interfaz de Sentry).

## 7. Seguridad
- Barrido de secretos en todo lo versionado (patrones de claves de Mercado Pago, OpenAI, Google, Resend, Sentry, JWT, claves privadas, URLs de base de datos con contraseña): **ninguno**. Historial de git: sin claves OAuth ni tokens reales. `.env*` ignorados (solo `.env.example`). Variables `NEXT_PUBLIC_*` en el código: solo URL de la app, DSN público, URL/anon key de Supabase, datos de Vercel — ningún secreto.
- Neutralizados identificadores con forma de token de Mercado Pago que había en 3 archivos de pruebas (ahora claramente falsos).
- Zero Trust verificado en pruebas de base de datos y E2E 04 (escalada de privilegios, aislamiento entre clientes, MFA del personal, inmutabilidad de pagos y auditoría).
- **Rotación pendiente (acción tuya)**: secreto de prueba del webhook y secreto OAuth de Google que quedaron expuestos fuera del repositorio (conversaciones). No se pueden generar sin ti (ver sección 20).

## 8. Rendimiento
Detalle en `PERFORMANCE-AUDIT-REPORT.md`. En producción tras el despliegue (misma máquina, red ruidosa; se compara el exceso sobre un archivo estático en caché):
| Ruta | Antes (exceso sobre base) | Después |
|---|---:|---:|
| `/tienda` | ≈0,55–0,77 s | ≈0,08–0,17 s |
| Ficha de producto | ≈0,28–0,50 s | ≈0,11–0,25 s |
Esqueletos de carga inmediatos, shell único del Shop y caché de 60 s con invalidación instantánea al editar/sincronizar. No se cambió la región de Vercel (decisión posterior, ver sección 20). Navegación producto → producto: mejora de percepción (esqueleto inmediato), no medible con herramientas de red desde aquí. Lighthouse/throttling/profiler no se ejecutaron.

## 9. Accesibilidad
Auditoría automática de contraste AA con axe-core sobre 9 pantallas públicas, 10 de cliente y 11 de personal, en 390 y 1440 px. Hallazgo real: texto naranja `#FF8A00` sobre fondo claro (2,2–2,4:1). Corrección mínima: token de texto `--color-brand-text: #A35500` (≥5:1) aplicado solo donde fallaba; paleta, Manrope e identidad sin cambios (el naranja sigue igual en botones, fondos y sobre superficies oscuras). Resultado: **0 incumplimientos**. El logotipo está exento (WCAG 1.4.3). Pendiente manual: lector de pantalla real y revisión con dedos en dispositivo.

## 10. 404 / error / loading
- Existen `not-found`, `error`, `global-error`, `loading` en `/b` y `/c`, y esqueletos propios del Shop; recursos ajenos o inexistentes (ticket, cotización, documento) devuelven 404 por RLS; sin sesión → login con retorno seguro; rol incorrecto → su propio inicio.
- **Decisión técnica sobre la ficha retirada**: con `loading.tsx` la página se transmite y Next respondía 200 + noindex (incluso a Googlebot). Mejor solución implementada: la existencia se valida en `layout.tsx` del segmento **por encima** del esqueleto (lectura cacheada, sin consulta extra) → **404 HTTP real con esqueleto**, comprobado en local con navegador y Googlebot y en producción.

## 11. Shop
Catálogo, filtros, carrito (ids en el navegador, precios del servidor), un solo mensaje de WhatsApp, banner y envíos administrables, ficha, 404 real. Dentro de la app del cliente con navegación inferior. E2E 07 y 10.

## 12. Cliente
«Ahora estamos aquí» con una acción principal, estados de pago sin «Pagar» duplicado ni nombre del proveedor, «Solicitud recibida» vs «Equipo recibido», visor de cotización, documentos, equipos, perfil. E2E 08 y 10.

## 13. Personal
«Próxima acción» por momento, recepción que avanza sola con fotos completas, panel de pagos, propuesta automática, finalizar diagnóstico. E2E 03, 05, 10.

## 14. Pagos manuales
Efectivo, datáfono (comprobante privado obligatorio), transferencia (pendiente hasta validación del SUPERADMIN), otro; sin duplicados; auditoría completa. 12+ pruebas de base de datos y E2E 10 (con subida real a Cloudinary).

## 15. Diagnóstico
Preliminar de IA rotulado; técnico finaliza (PDF «Informe de diagnóstico» con síntomas, técnico, fecha, pruebas, hallazgos, recomendaciones y aviso); versión nueva si se reemite; el cliente lo ve como documento. Productos recomendados solo con evidencia.

## 16. Cotización
Por conceptos (mano de obra, repuestos, productos, otros) con crédito del diagnóstico explicado; propuesta automática solo con servicios y precios reales del catálogo («Requiere revisión» si no hay precio); PDF al enviar; aprobar/preguntar/rechazar con motivo; versionado.

## 17. Documentos
Tipo, número, versión, estado, huella SHA-256, ticket y cliente; las versiones firmadas no se sobrescriben. **Nuevo (migración 40)**: al aprobar una cotización se registra código, versión y SHA-256 del PDF que el cliente revisó (evento y auditoría; probado).

## 18. Firma
Firma electrónica de documentos y aceptación legal con versión y huella: cubierta por pruebas unitarias (`signature.test.ts`) y de base de datos (`security.test.ts`, `quotes.test.ts`). No hay E2E con trazo en el lienzo (requeriría simular el dibujo) — comprobación manual recomendada una vez.

## 19. Integraciones
Supabase (RLS/RPC) ✔ · Vercel ✔ · Cloudinary (privado, comprobantes y fotos; firmas del servidor) ✔ · Resend (dominio verificado) ✔ · OpenRouter IA (sin autoridad sobre dinero, permisos ni estados) ✔ · Sentry ✔ · Catálogo Excelenter (importado; sincronización automática a la espera de la URL) · Mercado Pago ⛔ pendiente deliberado.
Decisiones sobre pendientes funcionales: **redacción asistida por IA del diagnóstico** — no necesaria para el flujo mínimo (la IA ya aporta diagnóstico preliminar y la propuesta es por reglas); no se agrega superficie de IA sin necesidad. **Documento independiente de recomendaciones** — no necesario: el informe de diagnóstico y el acta de entrega ya incluyen las recomendaciones. **Huella en la aprobación** — implementada.

## 20. Pendientes reales
Ver el bloque final. Ninguno es resoluble desde el código o la infraestructura sin información o credenciales tuyas.

PRODUCTION STATUS:
GO WITH MANUAL ACTIONS

REQUIERE MI INTERVENCIÓN:
- Rotar el secreto de prueba del webhook y el secreto OAuth de Google que quedaron expuestos (generar nuevos en Mercado Pago/Google y actualizarlos en Vercel). **Decisión del propietario: se rotan después de probar el flujo completo; recordarlo cuando se pregunte qué falta para producción.**
- Confirmar el porcentaje de los niveles de urgencia (hoy 0 %, inactivos).
- Compartir la hoja de Excelenter «con el enlace» (o dar una URL privada) y definir `EXCELENTER_CATALOG_CSV_URL` en Vercel.
- Definir qué se considera «zonas aledañas» (envío de $20.000) y, si se quiere validar direcciones automáticamente, el proveedor de geocodificación.
- Decidir la región de Vercel (hoy `iad1`; la base está en `us-west-2`): medir desde Colombia una vista previa en `pdx1` antes de cambiar.
- Copias de seguridad: el plan de Supabase será gratuito (sin copias automáticas ni recuperación a un punto en el tiempo); definir la alternativa (copia programada de la base de datos y de los documentos fuera de Supabase).
- En Sentry (interfaz): crear alertas por correo para incidencias nuevas y confirmar que el primer error real llega con su release.
- Una vez: probar con el dedo la firma electrónica en un celular y usar un lector de pantalla en el flujo del cliente.

MERCADO PAGO:
PENDIENTE — NO ACTIVAR

## Actualización 2026-10-09
- Datos legales: ya cargados por el propietario en el CRM (NIT, domicilio y contacto aparecen en Términos y Tratamiento de datos; 9 documentos publicados sin campos pendientes). Se completó el ajuste público de correo de contacto (`business.email` = studio@technoultra.com) con registro en auditoría.
- MFA del propietario: confirmado funcionando por el propietario.
- Cobertura: «Guardar tarifas» ya guardaba (verificado en producción con una prueba sin cambios: 1 fila, permiso correcto), pero no daba respuesta visible; ahora muestra «Tarifas guardadas» o el error, rechaza valores no numéricos y tiene prueba E2E (escenario 12). Las tarifas existentes no se modificaron (Cali 15.000; Jamundí, Palmira y Yumbo 25.000).
- Firma con el dedo en el celular: pendiente de prueba manual del propietario.
