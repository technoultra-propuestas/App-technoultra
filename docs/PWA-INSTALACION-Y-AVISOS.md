# Instalación de la PWA, avisos del sistema y firma del acta (2026-10-13)

## Causas raíz encontradas

| Problema | Causa raíz | Corrección |
| --- | --- | --- |
| Los avisos «no llegaban» al teléfono | (1) **Nadie tenía un dispositivo suscrito**: en producción había 0 filas en `push_subscriptions` (aunque 2 clientes tenían `push_enabled`) y 0 envíos push intentados. El permiso solo se pedía desde un botón escondido en la pantalla de Avisos y el personal nunca lo activó. (2) **El envío solo se disparaba tras algunas acciones** (`scheduleEmailFlush`): la firma del cliente, la generación del acta, la firma presencial y la excepción NO lo llamaban; el resto esperaba al cron diario (plan Hobby). (3) El SUPERADMIN solo recibía la copia de supervisión (prioridad baja: sin push). | `PushPrompt` ofrece «Activar avisos» y repara en silencio la suscripción si ya hay permiso; todas las acciones que generan avisos disparan el envío; respaldo limitado a 1 vez/20 s en los layouts; migración 45: aviso real de prioridad alta al SUPERADMIN. |
| El ticket decía «En diagnóstico / Registrar el diagnóstico» con la firma pendiente | Tickets que **avanzaron antes del control de firma** (migración 44) conservan un acta pendiente; «Próxima acción» y el ticket del cliente solo miraban el estado y la obligación de firma solo aparecía en «Recibido». | La obligación se deriva del **estado persistido del acta** (cualquier estado del ticket) y se muestra arriba, justo bajo la cabecera; el personal ve un aviso adicional sin perder su acción principal. |
| Instalación con tutorial | El aviso esperaba 20 s, decía «Instalar aplicación» y en iPhone escondía los pasos tras un botón; el evento nativo se capturaba tras hidratar React (podía perderse). | Captura temprana del evento en `<head>`, botón «Instalar» que llama a `prompt()` con un clic, a los 3 s; iPhone: pasos visibles de Safari; sin botón engañoso. |

## Instalación
- **Android / escritorio (Chrome, Edge):** botón **Instalar** → `prompt()` nativo. Se informa «Instalando…» o «Instalación cancelada».
- **iPhone / iPad:** iOS no tiene API web de instalación. Se muestran 2 pasos (Compartir → Añadir a pantalla de inicio); en Chrome u otras apps se pide abrir en Safari.
- **Ya instalada** (modo standalone): no aparece. **Sin instalación posible:** sin botón; la sección «Más» da la alternativa del menú del navegador.
- Se puede cerrar y no reaparece en 14 días. No tapa la barra inferior. Código: `src/lib/pwa/install.ts` (lógica pura probada), `useInstall.ts`, `InstallBanner.tsx`, `InstallApp.tsx`.

## Avisos del sistema operativo
- El push lo envía el servidor (Web Push/VAPID) y lo muestra el **service worker** con la notificación estándar del navegador: título, mensaje fijo por tipo (sin montos ni datos personales), acción **Abrir** y enlace interno (el SW rechaza rutas externas y `//dominio`).
- **No se silencia nada desde el código** (sin `silent`); `vibrate` es solo la sugerencia estándar. El sonido, la vibración, el modo concentración y los canales los decide el sistema operativo.
- Estados: creado → intentado → enviado/fallido (`notification_deliveries`); suscripciones caducadas (404/410) se eliminan; el `tag` evita duplicados visibles; `pushsubscriptionchange` re-suscribe.
- Eventos de la firma: cliente («Firma el acta…», «Documento firmado»), técnico asignado y **SUPERADMIN** («Firmada: acta de recepción», prioridad alta, enlace al ticket), idempotentes por (destinatario, evento).

## Limitaciones que NO se pueden resolver con una PWA
- **No es igual que WhatsApp/Telegram.** La API web no permite elegir el sonido de la notificación, forzar vibración ni crear canales de Android. En Android el sonido depende del canal que Chrome/la PWA cree y de la configuración del teléfono; con silencio o «No molestar» no sonará (y no se intenta saltar).
- **iPhone/iPad:** el push web solo existe con la app **añadida a la pantalla de inicio** (iOS 16.4 o superior) y con permiso concedido; en Safari normal no hay push. El permiso solo se puede pedir con un toque del usuario.
- **Android:** requiere permiso de notificaciones (Android 13+) y que no estén bloqueadas para Chrome/la PWA en Ajustes; algunos fabricantes (ahorro de batería) retrasan o descartan push.
- Una **app nativa** (con FCM/APNs) permitiría canales con sonido propio, prioridad y entrega crítica configurable; no es posible solo con la PWA.

## Qué está probado y qué no
- Probado (automatizado): lógica de instalación por plataforma, emulación de Android/iPhone/standalone en Chrome, firma y estados, avisos por rol sin duplicados, envío push disparado al instante (intento real hacia suscripciones de prueba inexistentes), service worker real (con `self` simulado y en Chrome con `ServiceWorker.deliverPushMessage`), seguridad entre clientes y enlaces con login.
- **No probado en dispositivos físicos:** el diálogo nativo de instalación, la llegada de un push por FCM/APNs a Android/iPhone/escritorio, el sonido y la vibración, ni el comportamiento de la PWA instalada tras cerrarla.
