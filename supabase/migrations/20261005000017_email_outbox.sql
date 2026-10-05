-- FASE 11 · 17 · Cola de correos: los avisos importantes se envían por email respetando las preferencias del usuario.
-- El servidor "reclama" lotes (SKIP LOCKED + marca de envío) para no duplicar correos entre ejecuciones concurrentes.

alter table public.notifications add column emailed_at timestamptz;
create index notifications_email_pending_idx on public.notifications (created_at) where emailed_at is null and channel = 'in_app';

-- Tipos que merecen correo (lista cerrada). Los demás avisos quedan solo dentro de la app.
create function private.email_worthy(p_type text) returns boolean
language sql immutable set search_path = '' as $$
  select p_type in ('quote.sent', 'quote.answered', 'document.available', 'payment.approved', 'maintenance.due')
      or p_type = 'ticket.status_changed'
$$;

create function public.claim_email_notifications(p_limit int default 25)
returns table (id uuid, to_email text, full_name text, title text, body text, type text, entity_type text, entity_id uuid)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select n.id from public.notifications n
    join public.profiles p on p.id = n.recipient_id and p.is_active and p.deleted_at is null
    left join public.notification_preferences np on np.profile_id = n.recipient_id
    where n.emailed_at is null and n.channel = 'in_app' and n.created_at > now() - interval '3 days'
      and private.email_worthy(n.type) and coalesce(np.email_enabled, true)
    order by n.created_at
    limit greatest(1, least(p_limit, 100))
    for update of n skip locked
  ), marked as (
    update public.notifications n set emailed_at = now() from picked where n.id = picked.id returning n.*
  )
  select m.id, p.email, p.full_name, m.title, m.body, m.type, m.entity_type, m.entity_id
  from marked m join public.profiles p on p.id = m.recipient_id;
end $$;
revoke execute on function public.claim_email_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_email_notifications(int) to service_role;

-- Los avisos que NO merecen correo se marcan para no acumularse en el índice pendiente.
create function public.skip_non_email_notifications() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.notifications set emailed_at = now() where emailed_at is null and not private.email_worthy(type);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.skip_non_email_notifications() from public, anon, authenticated;
grant execute on function public.skip_non_email_notifications() to service_role;
