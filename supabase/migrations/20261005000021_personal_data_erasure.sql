-- LEY 1581 · 21 · Supresión (anonimización) de datos personales de un cliente.
-- Se anonimiza la ficha, la cuenta, direcciones y equipos; se CONSERVAN los registros que la ley comercial/tributaria exige
-- (tickets, cotizaciones, pedidos, pagos, documentos firmados, aceptaciones legales y auditoría), sin vínculo a datos de contacto.
-- Solo administración; bloquea si hay trabajo o pedidos abiertos. Siempre auditado. El bloqueo de la cuenta de acceso
-- (auth.users) lo hace la Server Action con la API de administración, después de esta función.

create function public.anonymize_customer(p_customer uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare c public.customers%rowtype; v_profile uuid; v_tag text;
begin
  if not private.is_admin() then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into c from public.customers where id = p_customer for update;
  if not found then raise exception 'customer_not_found' using errcode = 'P0002'; end if;
  if c.full_name = 'Cliente anonimizado' and c.deleted_at is not null then return c.profile_id; end if;
  if exists (select 1 from public.tickets where customer_id = p_customer and status not in ('delivered', 'cancelled'))
     or exists (select 1 from public.orders where customer_id = p_customer and status not in ('delivered', 'cancelled')) then
    raise exception 'customer_has_open_work' using errcode = 'P0001';
  end if;
  v_profile := c.profile_id;
  v_tag := replace(p_customer::text, '-', '');

  update public.customers
     set full_name = 'Cliente anonimizado', phone = null, email = null, document_type = null, document_number = null,
         company_name = null, deleted_at = coalesce(deleted_at, now())
   where id = p_customer;
  update public.addresses
     set label = 'Eliminada', line1 = 'Dirección eliminada', line2 = null, neighborhood = null, notes = null,
         latitude = null, longitude = null, is_default = false, deleted_at = coalesce(deleted_at, now())
   where customer_id = p_customer;
  update public.equipment
     set serial = null, notes = null, deleted_at = coalesce(deleted_at, now())
   where customer_id = p_customer;
  if v_profile is not null then
    update public.profiles
       set email = 'anonimo-' || v_tag || '@anonimizado.invalid', full_name = 'Cliente anonimizado', avatar_url = null,
           is_active = false, deleted_at = coalesce(deleted_at, now())
     where id = v_profile;
  end if;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'customer.anonymized', 'customers', p_customer::text, '{}'::jsonb);
  return v_profile;
end $$;

revoke execute on function public.anonymize_customer(uuid) from public, anon;
grant execute on function public.anonymize_customer(uuid) to authenticated, service_role;
