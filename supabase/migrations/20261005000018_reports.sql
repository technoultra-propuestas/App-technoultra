-- FASE 11 · 18 · Reportes de administración (agregados; sin datos personales).

create function public.admin_report(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_from timestamptz; v_to timestamptz;
begin
  if not private.has_permission('reports.view') then raise exception 'forbidden' using errcode = '42501'; end if;
  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 366 then raise exception 'invalid_range' using errcode = '22023'; end if;
  v_from := (p_from::text || ' 00:00:00-05')::timestamptz;
  v_to := ((p_to + 1)::text || ' 00:00:00-05')::timestamptz;
  return jsonb_build_object(
    'range', jsonb_build_object('from', p_from, 'to', p_to),
    'tickets_by_status', coalesce((select jsonb_object_agg(status, n) from (select status, count(*) n from public.tickets where deleted_at is null group by status) s), '{}'::jsonb),
    'tickets_created', (select count(*) from public.tickets where created_at >= v_from and created_at < v_to),
    'tickets_delivered', (select count(*) from public.tickets where delivered_at >= v_from and delivered_at < v_to),
    'avg_days_to_deliver', (select round(avg(extract(epoch from delivered_at - received_at) / 86400)::numeric, 1) from public.tickets where delivered_at >= v_from and delivered_at < v_to),
    'quotes_sent', (select count(*) from public.quotes where sent_at >= v_from and sent_at < v_to),
    'quotes_approved', (select count(*) from public.quotes where status = 'approved' and decided_at >= v_from and decided_at < v_to),
    'quotes_rejected', (select count(*) from public.quotes where status = 'rejected' and decided_at >= v_from and decided_at < v_to),
    'revenue_cop', coalesce((select sum(amount) from public.payments where status = 'approved' and approved_at >= v_from and approved_at < v_to), 0),
    'orders_paid', (select count(*) from public.orders where paid_at >= v_from and paid_at < v_to),
    'new_customers', (select count(*) from public.customers where created_at >= v_from and created_at < v_to and deleted_at is null),
    'ai_diagnostics', (select count(*) from public.ai_diagnostics where created_at >= v_from and created_at < v_to),
    'top_services', coalesce((
      select jsonb_agg(jsonb_build_object('name', description, 'count', n) order by n desc)
      from (select qi.description, count(*) n from public.quote_items qi join public.quotes q on q.id = qi.quote_id
            where q.status = 'approved' and q.decided_at >= v_from and q.decided_at < v_to and qi.kind = 'service'
            group by qi.description order by n desc limit 5) t), '[]'::jsonb)
  );
end $$;
revoke execute on function public.admin_report(date, date) from public, anon;
grant execute on function public.admin_report(date, date) to authenticated, service_role;
