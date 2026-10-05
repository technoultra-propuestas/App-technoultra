# Catálogo oficial: carga inicial desde Excel

**Fuente:** `data/import/catalogo_servicios_mantenimiento_computadores_cali.xlsx` (solo para la carga inicial; la app NUNCA lo lee en ejecución).
**Fuente de verdad:** Supabase (`services`, `service_categories`, `service_subcategories`), administrada desde el CRM en `/b/servicios`.

## Resultado de la validación (sin escribir en BD)
- 161 servicios · 13 categorías · 107 subcategorías · 41 con diagnóstico · 34 "Desde" · 15 "+ repuesto".
- 0 errores. Ningún dato fue rechazado ni corregido en silencio.

## Cómo se carga
1. Aplicar la migración `20261005000020_service_catalog.sql` (`supabase db push`).
2. `node scripts/import-catalog.mjs` valida (dry-run). `node --env-file=.env.local scripts/import-catalog.mjs --apply` carga.
3. Idempotente: clave estable `tarifario-2026:NNNN` en `service_import_meta`. Reejecutar no duplica ni pisa ediciones del CRM.

## Mapeo (decisiones documentadas)
| Excel | Base de datos |
|---|---|
| Tipo de precio Fijo / Desde / Gratis | `price_mode` fixed / from / fixed (precio 0, etiqueta "Gratis") |
| Mano de obra | fixed + `parts_extra = true` ("+ repuesto") |
| Por programa/punto/unidad/PC/Jornada/incidente, Mensual | fixed + `price_unit` |
| Texto original del tipo | `price_type_label` |
| Modalidad (Presencial/Taller/Laboratorio → store; Domicilio/Empresa → home; Remoto/Chat → remote) | `allowed_modalities`; texto original en `modality_label`. **Recogida (pickup) no se asigna: el Excel no la define.** |
| Requiere diagnóstico Sí/No | `requires_diagnosis`; `requires_quote` = Desde ∨ diagnóstico ∨ + repuesto |
| Garantía | 0 días (el Excel no la define) |
| `requires_equipment` | false solo en "Asesoría Tecnológica" y "Empresas" (decisión operativa, editable) |
| Hojas Fuentes / Reglas_Precios | `catalog_sources` / `catalog_pricing_rules` (solo administración, referencia) |

## Histórico
Cotizaciones, tickets y solicitudes guardan `service_snapshot` (jsonb) al crearse: editar el catálogo no cambia lo ya cotizado.
Eliminar un servicio con historial lo archiva (`delete_service`); sin historial se borra. Cambios auditados en `audit_logs`.

## Pendiente de decisión del propietario
Ver informe final: IVA incluido o no, recargos por urgencia/cobertura (Reglas_Precios, aún no automatizados), "Diagnóstico de red" duplicado en dos categorías, servicios digitales (no están en el Excel).
