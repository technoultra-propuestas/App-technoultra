-- CATÁLOGO · 23 · "Diagnóstico de red" estaba dos veces en el Excel (filas 0006 y 0119 de la carga inicial):
--   · Diagnóstico y Soporte › Diagnóstico   (canónico, se conserva)
--   · Redes y Wi-Fi › Diagnóstico           (duplicado funcional: mismo precio $89.900, modalidad, alcance y fuente)
-- Decisión comercial: una sola clasificación (Diagnóstico y Soporte › Diagnóstico de red). El duplicado NO se borra: se archiva
-- (oculto, conserva su trazabilidad de importación) y solo si coincide en todo con el canónico y no tiene historial.
-- Para revertir: update public.services set is_active = true, deleted_at = null where slug = 'diagnostico-de-red-diagnostico';
update public.services dup
   set is_active = false, deleted_at = coalesce(dup.deleted_at, now())
  from public.service_import_meta md, public.service_import_meta mc, public.services can
 where md.service_id = dup.id and md.import_key = 'tarifario-2026:0119'
   and mc.service_id = can.id and mc.import_key = 'tarifario-2026:0006'
   and dup.name = can.name and dup.base_price = can.base_price and dup.price_mode = can.price_mode
   and dup.allowed_modalities = can.allowed_modalities
   and dup.deleted_at is null
   and not exists (select 1 from public.quote_items where service_id = dup.id)
   and not exists (select 1 from public.tickets where service_id = dup.id)
   and not exists (select 1 from public.service_requests where service_id = dup.id)
   and not exists (select 1 from public.order_items where service_id = dup.id)
   and not exists (select 1 from public.digital_projects where service_id = dup.id);
