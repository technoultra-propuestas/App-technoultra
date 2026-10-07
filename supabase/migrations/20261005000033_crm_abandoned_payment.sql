-- CRM AUTOMÁTICO · 33 · Un pago en línea que vence sin completarse deja una tarea de seguimiento (una sola por ticket abierto).
-- Solo crea la tarea para que el equipo contacte al cliente; no cambia precios, estados ni pagos.
create or replace function public.expire_pending_service_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  with expired as (
    update public.payments set status = 'expired'
     where purpose in ('quote', 'diagnosis', 'service') and status = 'pending' and created_at < now() - interval '48 hours'
    returning customer_id, ticket_id, code
  ), ins as (
    insert into public.crm_tasks (customer_id, ticket_id, task_type, due_at, note)
    select distinct on (e.ticket_id) e.customer_id, e.ticket_id, 'followup', now(), left('Pago sin completar (' || coalesce(e.code, 'pago en línea') || '). Contactar al cliente para ayudarle a terminar.', 500)
    from expired e
    where e.ticket_id is not null
      and not exists (select 1 from public.crm_tasks c where c.ticket_id = e.ticket_id and c.task_type = 'followup' and c.status in ('pending', 'contacted', 'interested', 'scheduled', 'no_answer') and c.note like 'Pago sin completar%')
    returning 1
  )
  select count(*) into n from expired;
  return n;
end $$;
revoke execute on function public.expire_pending_service_payments() from public, anon, authenticated;
grant execute on function public.expire_pending_service_payments() to service_role;
