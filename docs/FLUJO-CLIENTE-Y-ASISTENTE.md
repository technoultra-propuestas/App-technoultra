# Flujo del cliente automatizado + Asistente TechnoUltra (2026-10-07)

## 1. Flujo anterior → flujo nuevo
**Antes:** Cliente → Solicitud → *espera* → SUPERADMIN «Recibir y crear ticket» → Ticket → el cliente vuelve → paga.

**Ahora:** Cliente → Solicitud → **el servidor crea el ticket** (`auto_create_ticket`, idempotente, solo `service_role`) → «Solicitud recibida» muestra el siguiente paso:
- **Camino A (pago inmediato):** precio fijo, sin cotización ni diagnóstico previo, modalidad local o remota → botón «Pagar $X» → Mercado Pago (Orders API) → webhook verificado → pago aprobado → el ticket queda pagado (`prepaid_at`) y el SUPERADMIN recibe «Servicio pagado».
- **Camino B (cotización):** diagnóstico/cotización/«desde»/«+ repuesto»/domicilio/recogida/digital → el ticket existe desde el inicio, el cliente no paga nada hasta aprobar una cotización.
Crear el ticket NO inicia diagnóstico, no aprueba nada, no toca inventario ni cambia estados técnicos. Los servicios digitales siguen naciendo como proyecto (los gestiona el SUPERADMIN).

## 2. Matriz de tipos de servicio (centralizada en la base de datos)
`public.service_flow(service, modalidad)` decide `immediate` o `quote`; no hay reglas en componentes.
| Condición | Flujo |
| --- | --- |
| `flow_override = 'quote'` | cotización |
| `flow_override = 'immediate'` (y servicio técnico, modalidad local/remota, precio > 0) | pago inmediato |
| servicio digital · modalidad domicilio/recogida (lleva tarifa de cobertura) · sin precio | cotización |
| `parts_extra` («+ repuesto») · `price_mode ≠ fixed` («Desde») · `requires_quote` · `requires_diagnosis` | cotización |
| precio fijo sin cotización ni diagnóstico previo | pago inmediato |
Además `allow_online_payment = false` hace que el servicio se pague en el local (el SUPERADMIN lo registra). Los servicios de cobro de diagnóstico (`is_diagnostic_fee`) siguen su propio camino (propósito de pago `diagnosis`, con crédito abonable una sola vez). En producción hoy: 92 servicios de precio fijo, 9 de diagnóstico y 59 con cotización.
Pendiente de producto: pantalla para editar `flow_override` / `allow_online_payment` desde el CRM (la columna ya existe y solo el SUPERADMIN puede escribirla).

## 3. Cero confianza en el navegador
El navegador solo dice QUÉ quiere (servicio, modalidad, texto). El servidor recupera de la base de datos precio (instantánea del servicio), cobertura, estado y propiedad; calcula el total y crea la Order. No se aceptan `amount`, `price`, `total`, `status`, `customer_id`, `domicilio`, `urgencia`, `crédito` del cliente (probado en `tests/unit/request-action.test.ts` y `tests/db/auto-ticket.test.ts`). Doble clic: una sola solicitud (reutilización de solicitudes idénticas por 2 min), un solo ticket (índice único), un solo pago pendiente (índice único + bloqueo asesor) y una sola Order por pago (`X-Idempotency-Key = ord-<pago>`).

## 4. Capa de conocimiento y respuesta (asistente)
`routeAssistantRequest()` (`src/lib/assistant/router.ts`) es el único punto de entrada.
1. **Datos propios** (mi ticket, pago, pedido, cotización): consulta con la sesión de la persona (RLS). 0 tokens, sin caché.
2. **Reglas deterministas:** precio y alcance de un servicio («Desde» nunca como precio final), cobertura y tarifa, significado de estados, saludos. 0 tokens.
3. **FAQ publicada** (`knowledge_entries`): plantillas `{price}`, `{cities}`… rellenadas desde `services`, `coverage_areas` y `app_settings`; si la fuente no existe, la entrada no se responde a medias. 0 tokens.
4. **IA (OpenRouter, solo servidor)** únicamente si lo anterior no resuelve: contexto mínimo (hasta 8 servicios candidatos + hasta 3 entradas recuperadas + el mensaje delimitado como NO confiable), `max_tokens 450`, timeout 15 s, **sin reintentos**, máximo 12 consultas con IA por hora y persona, caché 10 min. Salida validada fuera del modelo (JSON estricto, solo ids de candidatos, sin enlaces/HTML).
5. **Respaldo:** si la IA falla → FAQ aproximada o respuesta segura con enlaces. El asistente nunca bloquea solicitar, pagar, consultar ni aprobar.
Todas las respuestas se ven igual para el cliente (sin «respuesta sin IA»).

### Qué usa IA y qué no
- **Sin IA:** precios, qué incluye, cobertura, estados, mis tickets/pagos/pedidos/cotizaciones, FAQ, saludos, cómo pagar, garantía, contacto.
- **Con IA:** orientación («mi computador está lento y se apaga, ¿qué necesito?»), elegir entre servicios, preguntas ambiguas.
- **Diagnóstico preliminar con IA** de la solicitud (existente): conserva el aviso legal obligatorio y la validación humana.

### Herramientas y acciones
- La IA **no tiene herramientas**: no hay *function calling* ni acceso a Supabase, service role, Mercado Pago o Cloudinary. El servidor ejecuta funciones explícitas y de mínimo privilegio y le entrega solo el resultado mínimo: `loadCatalog` (servicios activos), `loadCoverage`, `loadEntries` (FAQ publicada), consultas propias con RLS (`tickets`, `payments`, `orders`, `quotes`).
- **Prohibido para la IA:** aprobar/rechazar/cancelar/reembolsar pagos, cambiar precios, cotizaciones, descuentos, roles, permisos, RLS, estados críticos, inventario, garantías, documentos legales, firmar o aceptar contratos, crear solicitudes o usuarios. Solo sugiere servicios existentes (enlace a `/c/solicitar/<slug>`); la persona confirma en el formulario.
- Seguridad de contenido: el mensaje del cliente y el contenido recuperado van entre `BEGIN_/END_` y se tratan como DATOS; los marcadores se neutralizan en la entrada.

## 5. Centro de conocimiento (SUPERADMIN, `/b/conocimiento`)
Tabla **Pregunta · Fuente · IA · Estado** con filtros, edición con **versiones inmutables** (`knowledge_entry_versions`), publicar/archivar, y métricas de 30 días (consultas, % con IA, tokens entrada/salida, errores y latencia de IA, desglose por ruta). Solo el SUPERADMIN con MFA escribe (política RLS + comprobación en servidor). `ai_usage` no guarda contenido de conversaciones.

## 6. Variables
`AI_PROVIDER=openrouter`, `OPENROUTER_API_KEY`, `AI_MODEL` (solo servidor). Nunca `NEXT_PUBLIC_OPENROUTER_*`. Sin modelo válido el asistente cae al respaldo.

## 7. Rutas y acciones
Nuevas: `/c/asistente`, `/b/conocimiento`, `/b/conocimiento/nuevo`, `/b/conocimiento/[id]`. Modificadas: `/c/solicitar/listo` (siguiente paso y pago), `/c/tickets/[id]` (pago de servicio), `/c`, `/c/solicitar`, `/c/mas`, `/b/mas`. Server Actions: `createRequestAction` (ticket automático + deduplicación), `startServicePaymentAction` (nuevo propósito `service`), `askAssistantAction`, `saveEntryAction`, `setEntryStatusAction`.
Migraciones: 30 (flujo, ticket automático, pago de servicio), 31 (excluye «+ repuesto»), 32 (conocimiento + métricas), 33 (CRM por pago abandonado).

## 8. Auditoría de oportunidades de automatización
| Área | Oportunidad | Clasificación | Estado |
| --- | --- | --- | --- |
| Solicitudes | Crear ticket al enviar | AUTOMATIZAR | Hecho |
| Pagos | Pago pendiente + Order al solicitar servicio de precio fijo | AUTOMATIZAR | Hecho |
| Pagos | Expirar pagos 48 h y cancelar la Order | AUTOMATIZAR | Hecho |
| CRM | Tarea de seguimiento por pago abandonado | AUTOMATIZAR | Hecho (sin duplicados) |
| CRM | Tarea al pagar / aprobar / rechazar cotización | AUTOMATIZAR (bajo riesgo) | Pendiente |
| Notificaciones | Aviso al SUPERADMIN de nueva solicitud y pago; sin duplicados | AUTOMATIZAR | Hecho |
| Notificaciones | WhatsApp / Web Push | AUTOMATIZAR | Pendiente (requiere proveedor y credenciales) |
| Catálogo | Editar `flow_override` / `allow_online_payment` desde el CRM | MANTENER MANUAL (decisión comercial) con pantalla | Pendiente |
| Tickets | Estados derivados (p. ej. pasar a «Esperando repuesto») | ASISTIR CON IA (sugerir) | No automatizar el cambio |
| Cotizaciones | Borrador sugerido desde el diagnóstico | ASISTIR CON IA (sugerencia al técnico) | Pendiente |
| Cotizaciones | Aprobación, precios, descuentos, crédito | NO AUTOMATIZAR | — |
| Pagos | Reembolsos y cancelaciones manuales | NO AUTOMATIZAR | — |
| Documentos | Resumen en lenguaje sencillo de un documento (el documento real siempre visible) | ASISTIR CON IA | Pendiente |
| Garantías / mantenimiento | Recordatorios por correo/aviso | AUTOMATIZAR | Parcial (tareas CRM existentes) |
| Tienda | Aviso de stock bajo al SUPERADMIN | AUTOMATIZAR | Pendiente |
| Tienda | Reposición automática / cambios de inventario | NO AUTOMATIZAR | — |
| Soporte | Respuestas a preguntas frecuentes | ASISTIR (FAQ sin IA) | Hecho |
| Legal | Publicación o cambios de textos legales | NO AUTOMATIZAR | — |
| Seguridad | Roles, permisos, RLS, MFA | NO AUTOMATIZAR | — |
| Técnico | Resumen del caso para el técnico (síntomas, equipo, historial) | ASISTIR CON IA | Pendiente |
