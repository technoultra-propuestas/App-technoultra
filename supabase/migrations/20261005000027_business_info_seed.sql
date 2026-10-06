-- DATOS DEL NEGOCIO · 27 · Valores entregados por el propietario (no inventados). Idempotente: no pisa lo que ya se haya editado en el CRM.
-- Siguen siendo editables en CRM → Configuración → Negocio (público). El correo de contacto no se ha dado: queda vacío.
insert into public.app_settings (key, value, description, is_public) values
  ('business.name', '"TechnoUltra"', 'Nombre del negocio (público)', true),
  ('business.phone', '"3183943465"', 'Teléfono de contacto (público)', true),
  ('business.address', '"Cra 1A 59-60"', 'Dirección del local (público)', true)
on conflict (key) do nothing;
