# Formularios con memoria, retorno de flujos, pagos y estados

## Memoria de formularios (borradores)
- Un solo mecanismo: `<FormDraft id="…" />` dentro de cualquier `<form>` (`src/components/forms/FormDraft.tsx`, lógica pura en `src/lib/drafts.ts`). Guarda lo escrito tras 400 ms sin teclear, lo restaura al volver o recargar, lo borra al enviar y, si el envío falla (React 19 vacía el formulario), devuelve lo escrito.
- Clave = **persona + ruta + formulario** (`DraftProvider` con el id de la persona en los layouts `/c`, `/b` y onboarding; `anon` antes de iniciar sesión). Vence a las 24 h. **Cerrar sesión borra todos los borradores** del navegador.
- **Nunca** se guardan contraseñas, códigos, tokens, secretos, tarjetas, documentos de identidad, firmas ni archivos (por tipo y por nombre de campo); además el lector descarta esos campos aunque alguien manipule el almacenamiento.
- Aplicado a: login (solo correo), registro, onboarding (celular, dirección, equipo), solicitud de servicio, equipo nuevo, dirección nueva, perfil, pregunta/rechazo de cotización, banner del Shop, contacto del CRM, ticket de mostrador y login del personal.

## Solicitud → crear equipo/dirección → volver
- «Agregar equipo» y «Agregar dirección» desde la solicitud llevan `?returnTo=/c/solicitar/<servicio>`. Al guardar se redirige a esa ruta con `?equipo=<id>` / `?direccion=<id>` y el elemento queda **seleccionado**; lo escrito sigue ahí (borrador).
- `safeReturnTo` (`src/lib/navigation.ts`) acepta solo rutas internas permitidas (`/c/`, `/b/`, `/tienda`, `/avisos`): rechaza `//host`, `https://…`, `javascript:`, `\`, `..`, caracteres de control y rutas no listadas. Se valida al mostrar el enlace **y** de nuevo en la acción de servidor.

## Diagnóstico de IA contextual
Aparece solo, tras 2,2 s sin escribir y con al menos 30 caracteres (máx. 4 análisis por visita; memoria de 10 min por consulta idéntica; 10 por hora y persona). Muestra causa principal, otras causas, urgencia, recomendación y el aviso obligatorio. «Productos que podrían ayudarte» sale de **reglas deterministas** síntoma → subcategoría (`src/lib/ai/product-hints.ts`), nunca de la IA, con «Conviene verificar compatibilidad antes de comprar». Si la IA falla, respuesta básica por reglas.

## Estados del pago (sin nombrar al proveedor)
`src/lib/payments/state.ts`: pago pendiente → **«Pago en validación»** (no se ofrece «Pagar» otra vez; solo «Continuar con el pago», que reutiliza la misma orden), aprobado o concepto ya liquidado → **«Pago confirmado»** (con el siguiente paso según la modalidad), rechazado/cancelado → «Pagar de nuevo», vencido → pago nuevo, reembolsado → sin pagar. Se calcula en el servidor con las filas de `payments`; la base de datos impide dos pagos activos del mismo concepto (índices únicos) y serializa el doble clic (`begin_service_payment`).

## «Recibido» es solo para el equipo
`src/lib/domain/ticket-flow.ts`: sin acta de recepción el ticket es **«Solicitud recibida»**; con acta, **«Equipo recibido»** (el estado técnico `received` no cambia). Soporte remoto nunca dice «Equipo recibido». Avance: Solicitud · Equipo recibido · Diagnóstico · Aprobación · Servicio · Entrega (remoto: sin paso de equipo). El ticket separa solicitud, pago, equipo, diagnóstico, servicio y entrega.
