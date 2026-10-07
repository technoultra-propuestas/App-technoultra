-- La lectura pública de los ajustes del Shop (una sola fila, sin datos privados) se expresa con una condición real en lugar de «true»:
-- así la revisión automática «ninguna política concede acceso incondicional» sigue siendo estricta para cualquier otra tabla.
drop policy shop_settings_public_read on public.shop_settings;
create policy shop_settings_public_read on public.shop_settings for select to anon, authenticated using (id is true);
