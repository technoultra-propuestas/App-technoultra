-- Las tablas del catálogo de proveedor (34) necesitan privilegios explícitos para service_role (el servidor escribe consultas, ejecuta el motor
-- y lee los registros); el proyecto no concede privilegios por defecto. Sin esto, registrar una consulta por WhatsApp fallaba en silencio.
grant all on public.product_subcategories, public.product_source, public.product_price_history, public.catalog_sync_runs, public.product_inquiries to service_role;
grant usage, select on all sequences in schema public to service_role;
