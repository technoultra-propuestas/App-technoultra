-- Clientes de mostrador: el técnico puede ver y completar los clientes QUE ÉL CREÓ (aún sin ticket asignado),
-- para registrar su equipo y abrir el ticket. No ve a ningún otro cliente.

create or replace function private.can_view_customer(p_customer uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.is_admin()
    or p_customer = private.my_customer_id()
    or (private.is_technician() and exists (
          select 1 from public.tickets t where t.customer_id = p_customer and t.assigned_to = auth.uid() and t.deleted_at is null))
    or (private.is_technician() and exists (
          select 1 from public.customers c where c.id = p_customer and c.created_by = auth.uid() and c.profile_id is null and c.deleted_at is null))
$$;

-- La política evalúa columnas directamente: una función STABLE no ve la fila recién insertada en INSERT ... RETURNING.
drop policy customers_read on public.customers;
create policy customers_read on public.customers for select to authenticated
  using ((select private.is_admin())
         or (deleted_at is null and (select private.can_view_customer(id)))
         or (deleted_at is null and profile_id is null and created_by = (select auth.uid()) and (select private.is_technician())));
