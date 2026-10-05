-- FASE 11 · 15 · Tareas periódicas (las invoca un cron del servidor con service_role): recordatorios de mantenimiento,
-- vencimiento de garantías, cotizaciones vencidas y limpieza.

create function public.run_housekeeping() returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Bogota')::date; v_remind int := 0; v_warr int := 0; v_exp int := 0; v_q int := 0; r record;
begin
  -- 1) mantenimiento: a 7 días o menos se avisa al cliente una sola vez
  for r in
    select mp.id, mp.due_at, c.profile_id
    from public.maintenance_plans mp join public.customers c on c.id = mp.customer_id
    where mp.status = 'scheduled' and mp.due_at <= now() + interval '7 days'
    for update of mp skip locked
  loop
    update public.maintenance_plans set status = 'reminded' where id = r.id;
    if r.profile_id is not null then
      insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id)
      values (r.profile_id, 'maintenance.due', 'Es hora del mantenimiento de tu equipo', 'Agenda tu mantenimiento preventivo con nosotros.', 'maintenance_plan', r.id);
    end if;
    v_remind := v_remind + 1;
  end loop;

  -- 2) garantías: las vencidas pasan a "expired"; las que vencen en 14 días generan tarea CRM (una vez)
  update public.warranties set status = 'expired' where status = 'active' and end_date < v_today;
  get diagnostics v_exp = row_count;
  insert into public.crm_tasks (customer_id, equipment_id, ticket_id, task_type, due_at, note)
  select w.customer_id, w.equipment_id, w.ticket_id, 'warranty', now(), 'La garantía ' || w.code || ' vence el ' || w.end_date::text
  from public.warranties w
  where w.status = 'active' and w.end_date between v_today and v_today + 14
    and not exists (select 1 from public.crm_tasks k where k.task_type = 'warranty' and k.note like '%' || w.code || '%');
  get diagnostics v_warr = row_count;

  -- 3) cotizaciones enviadas cuya vigencia terminó pasan a "expired" (el ticket sigue esperando decisión del personal)
  update public.quotes set status = 'expired' where status in ('sent', 'clarification') and valid_until < v_today;
  get diagnostics v_q = row_count;

  return jsonb_build_object('maintenance_reminders', v_remind, 'warranty_tasks', v_warr, 'warranties_expired', v_exp, 'quotes_expired', v_q,
                            'orders_expired', public.expire_pending_orders(), 'rate_limits_purged', public.purge_rate_limits());
end $$;
revoke execute on function public.run_housekeeping() from public, anon, authenticated;
grant execute on function public.run_housekeeping() to service_role;

-- Las cotizaciones vencidas: una nueva versión es la salida (revise_quote exige enviada; se amplía a vencida).
create or replace function public.revise_quote(p_quote uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare q public.quotes%rowtype; v_new uuid; v_role public.app_role := private.my_role(); v_ticket_status public.ticket_status;
begin
  if v_role is null or v_role = 'client' or not private.can_manage_quote(p_quote) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote for update;
  if q.status not in ('sent', 'clarification', 'expired') then raise exception 'quote_not_revisable' using errcode = 'P0001'; end if;
  update public.quotes set status = 'superseded' where id = q.id;
  insert into public.quotes (ticket_id, project_id, customer_id, version, supersedes_id, notes, terms, needs_part, created_by)
  values (q.ticket_id, q.project_id, q.customer_id, q.version + 1, q.id, q.notes, q.terms, q.needs_part, auth.uid())
  returning id into v_new;
  insert into public.quote_items (quote_id, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind)
  select v_new, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind
  from public.quote_items where quote_id = q.id;
  perform private.quote_event(q.id, 'revised', v_role::text, 'Se creó la versión ' || (q.version + 1));
  perform private.write_audit(auth.uid(), v_role::text, 'quote.revised', 'quotes', v_new::text, jsonb_build_object('from', q.id));
  if q.ticket_id is not null then
    select status into v_ticket_status from public.tickets where id = q.ticket_id;
    if v_ticket_status = 'awaiting_approval' then
      perform private.apply_transition(q.ticket_id, 'diagnosing', auth.uid(), v_role::text, 'Cotización en revisión', false);
    end if;
  end if;
  return v_new;
end $$;
