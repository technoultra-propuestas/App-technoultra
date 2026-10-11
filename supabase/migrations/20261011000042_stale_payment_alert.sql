-- Pagos en línea sin confirmar tras 30 minutos: el SUPERADMIN recibe UN aviso por pago y día para intervenir/conciliar.
-- (Antes un pago pendiente podía quedar en silencio hasta el vencimiento a las 48 h.) El cliente NO recibe aviso por esto:
-- su pantalla ya le explica la demora y se verifica sola; no se le avisa por cada consulta ni reintento.
create function public.notify_stale_payments() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_day text := ((now() at time zone 'America/Bogota')::date)::text;
begin
  for r in select p.id, p.ticket_id, p.order_id from public.payments p
           where p.provider = 'mercadopago' and p.status = 'pending'
             and p.created_at < now() - interval '30 minutes' and p.created_at > now() - interval '3 days' loop
    perform private.notify_superadmins('stale-pay:' || r.id || ':' || v_day, 'payment.stale', 'Pago en línea sin confirmar',
      'Un pago lleva más de 30 minutos sin confirmación del proveedor. Revisa el pago o contacta al cliente.',
      case when r.ticket_id is not null then 'ticket' when r.order_id is not null then 'order' else 'payment' end,
      coalesce(r.ticket_id, r.order_id, r.id), 'high', null);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_stale_payments() from public, anon, authenticated;
grant execute on function public.notify_stale_payments() to service_role;
