# Carga inicial del catálogo

El Excel de esta carpeta es **solo la fuente de la carga inicial** (`scripts/import-catalog.mjs`). La aplicación NO lo lee en ejecución: el catálogo vive en Supabase y se administra desde el CRM (`/b/servicios`).

    node scripts/import-catalog.mjs                          # valida, no escribe
    node --env-file=.env.local scripts/import-catalog.mjs --apply
