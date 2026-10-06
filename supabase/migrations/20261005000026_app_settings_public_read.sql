-- AJUSTES · 26 · El rol anónimo no podía leer NI los ajustes públicos de app_settings.
-- Causa: la política de lectura era «is_public OR private.is_superadmin()» para anon y authenticated. PostgreSQL comprueba el permiso de
-- EJECUCIÓN de la función al preparar la consulta (aunque is_public sea verdadero) y anon no puede ejecutar funciones privadas,
-- así que toda lectura anónima (datos públicos del negocio para SEO, JSON-LD, etc.) fallaba con 42501.
-- Solución: dos políticas independientes. Anon (y todos) leen solo lo público; el SUPERADMIN lee todo. No se concede EXECUTE a anon.
drop policy if exists app_settings_read on public.app_settings;
create policy app_settings_public_read on public.app_settings for select to anon, authenticated using (is_public);
create policy app_settings_superadmin_read on public.app_settings for select to authenticated using ((select private.is_superadmin()));
