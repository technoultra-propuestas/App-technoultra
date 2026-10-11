-- NOTIFICACIONES v2 · «notificar por responsabilidad, no por pertenencia al sistema».
-- Cada cambio de negocio CONFIRMADO en la base de datos registra sus avisos (una fila por destinatario) con una clave de evento que impide
-- duplicados (webhooks repetidos, dobles clics, reintentos). El envío por canal (correo, push) es una etapa aparte con su propio registro
-- (`notification_deliveries`): evento registrado → aviso creado → envío intentado → envío confirmado → leído (`read_at`).
-- Reglas: nadie recibe el aviso de su propia acción (salvo la confirmación que el cliente necesita ver); el técnico solo recibe lo de SUS tickets;
-- el SUPERADMIN solo lo que requiere supervisión; el cliente solo lo suyo. Los textos al cliente no prometen plazos.

-- ---------------------------------------------------------------- esquema
alter table public.notifications
  add column if not exists event_key text check (event_key is null or char_length(event_key) <= 200),
  add column if not exists priority text not null default 'normal' check (priority in ('low', 'normal', 'high'));
create unique index if not exists notifications_event_uidx on public.notifications (recipient_id, event_key) where event_key is not null;

alter table public.push_subscriptions
  add column if not exists last_success_at timestamptz,
  add column if not exists failed_count int not null default 0;

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notifications (id) on delete cascade,
  channel text not null check (channel in ('email', 'push')),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'skipped')),
  attempts int not null default 0,
  last_error text check (last_error is null or char_length(last_error) <= 300),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (notification_id, channel)
);
create index notification_deliveries_pending_idx on public.notification_deliveries (status, updated_at) where status in ('pending', 'failed');
create trigger notification_deliveries_updated before update on public.notification_deliveries for each row execute function private.set_updated_at();
alter table public.notification_deliveries enable row level security;
-- Solo el servidor (service_role) lee/escribe entregas: ningún usuario consulta ni altera el estado de envío.
revoke all on public.notification_deliveries from anon, authenticated;
grant all on public.notification_deliveries to service_role;

-- ---------------------------------------------------------------- piezas internas
create function private.profile_of_customer(p_customer uuid) returns uuid
language sql stable security definer set search_path = '' as $$
  select profile_id from public.customers where id = p_customer
$$;

/** Crea UN aviso para UN destinatario. Idempotente por (destinatario, clave de evento). No avisa a quien originó la acción (p_actor). */
create function private.notify(
  p_event text, p_recipient uuid, p_type text, p_title text, p_body text, p_entity_type text, p_entity_id uuid,
  p_priority text default 'normal', p_actor uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_recipient is null or p_recipient is not distinct from p_actor then return; end if;
  if not exists (select 1 from public.profiles where id = p_recipient and is_active and deleted_at is null) then return; end if;
  insert into public.notifications (recipient_id, type, title, body, entity_type, entity_id, event_key, priority)
  values (p_recipient, p_type, left(p_title, 160), left(p_body, 500), p_entity_type, p_entity_id, p_event, p_priority)
  on conflict (recipient_id, event_key) where event_key is not null do nothing;
end $$;

create function private.notify_superadmins(
  p_event text, p_type text, p_title text, p_body text, p_entity_type text, p_entity_id uuid, p_priority text default 'normal', p_actor uuid default null
) returns void
language plpgsql security definer set search_path = '' as $$
declare r record;
begin
  for r in select id from public.profiles where role = 'superadmin' and is_active and deleted_at is null loop
    perform private.notify(p_event, r.id, p_type, p_title, p_body, p_entity_type, p_entity_id, p_priority, p_actor);
  end loop;
end $$;

/** Texto de «qué sigue» según la modalidad (sin prometer plazos). */
create function private.modality_next_step(p_modality text) returns text
language sql immutable set search_path = '' as $$
  select case p_modality
    when 'pickup' then 'Nuestro equipo coordinará contigo la recogida del equipo en la dirección indicada.'
    when 'home' then 'Nuestro técnico se pondrá en contacto contigo para coordinar la visita.'
    when 'remote' then 'Un técnico te contactará para iniciar el soporte remoto; no necesitas entregar tu equipo.'
    else 'Nuestro equipo te indicará cómo coordinar la recepción de tu equipo.' end
$$;

-- ---------------------------------------------------------------- 1) solicitud creada (ticket nuevo)
create function private.on_ticket_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('ticket-created:' || new.id, private.profile_of_customer(new.customer_id), 'request.received',
    'Recibimos tu solicitud ' || new.code, 'Esto solo confirma que registramos tu solicitud. ' || private.modality_next_step(new.modality::text), 'ticket', new.id, 'normal', auth.uid());
  perform private.notify_superadmins('ticket-created:' || new.id, 'ticket.created', 'Nueva solicitud: ' || new.code,
    'Hay un ticket nuevo que requiere asignación y coordinación.', 'ticket', new.id, 'high', auth.uid());
  return null;
end $$;
create trigger tickets_notify_created after insert on public.tickets for each row execute function private.on_ticket_created();

-- La función que crea el ticket automático ya no inserta el aviso a mano (lo hace el trigger, con clave de evento).
create or replace function public.auto_create_ticket(p_request uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare r public.service_requests%rowtype; v_ticket uuid; v_kind public.service_kind;
begin
  select * into r from public.service_requests where id = p_request for update;
  if not found then raise exception 'request_not_found' using errcode = 'P0002'; end if;
  select id into v_ticket from public.tickets where service_request_id = r.id;
  if v_ticket is not null then return v_ticket; end if; -- ya existe: no se duplica
  if r.status not in ('pending', 'scheduled') then raise exception 'request_not_open' using errcode = 'P0001'; end if;
  select kind into v_kind from public.services where id = r.service_id;
  if v_kind is distinct from 'technical' then raise exception 'service_not_technical' using errcode = 'P0001'; end if;
  insert into public.tickets (customer_id, equipment_id, service_request_id, service_id, modality, problem, address_id)
  values (r.customer_id, r.equipment_id, r.id, r.service_id, r.modality, r.problem_description, r.address_id)
  on conflict (service_request_id) do nothing returning id into v_ticket;
  if v_ticket is null then select id into v_ticket from public.tickets where service_request_id = r.id; return v_ticket; end if;
  perform private.write_audit(null, 'system', 'ticket.auto_created', 'tickets', v_ticket::text, jsonb_build_object('request', r.id));
  return v_ticket;
end $$;
revoke execute on function public.auto_create_ticket(uuid) from public, anon, authenticated;
grant execute on function public.auto_create_ticket(uuid) to service_role;

-- Ticket de instalación de un pedido pagado: igual a la migración 29, pero el aviso lo da el disparador `on_ticket_created` (una sola vez, con clave de evento).
create or replace function private.create_installation_tickets(p_order uuid) returns int
language plpgsql security definer set search_path = '' as $$
declare o public.orders%rowtype; it record; v_ticket uuid; v_products text; v_n int := 0;
begin
  select * into o from public.orders where id = p_order;
  if not found then return 0; end if;
  select string_agg(description, ', ' order by description) into v_products from public.order_items where order_id = p_order and product_id is not null;
  for it in select oi.id, oi.service_id, oi.description from public.order_items oi where oi.order_id = p_order and oi.service_id is not null order by oi.id loop
    if exists (select 1 from public.tickets where order_item_id = it.id) then continue; end if; -- ya existe: no se duplica
    v_ticket := null;
    insert into public.tickets (customer_id, service_id, modality, problem, order_id, order_item_id, address_id)
    values (o.customer_id, it.service_id, 'home',
            left('Instalación incluida en el pedido ' || o.code || ': ' || it.description || coalesce('. Productos del pedido: ' || v_products, ''), 2000),
            o.id, it.id, o.address_id)
    on conflict (order_item_id) do nothing returning id into v_ticket;
    if v_ticket is null then continue; end if;
    v_n := v_n + 1;
    perform private.write_audit(null, 'system', 'ticket.created_from_order', 'tickets', v_ticket::text, jsonb_build_object('order', o.id, 'order_item', it.id));
  end loop;
  return v_n;
end $$;

-- ---------------------------------------------------------------- 2) asignación → el técnico asignado
create function private.on_ticket_assigned() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify('assign:' || new.id || ':' || new.assigned_to || ':' || extract(epoch from now())::bigint, new.assigned_to, 'ticket.assigned',
    'Nuevo ticket asignado: ' || new.code, left(new.problem, 160), 'ticket', new.id, 'high', auth.uid());
  return null;
end $$;
create trigger tickets_notify_assigned after update of assigned_to on public.tickets for each row
  when (new.assigned_to is not null and new.assigned_to is distinct from old.assigned_to) execute function private.on_ticket_assigned();

-- ---------------------------------------------------------------- 3) recepción física → cliente y técnico responsable
create function private.on_reception_created() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = new.ticket_id;
  if not found then return null; end if;
  perform private.notify('reception:' || t.id, private.profile_of_customer(t.customer_id), 'equipment.received',
    'Recibimos tu equipo', 'Ya tenemos tu equipo en TechnoUltra. Te avisaremos cuando empiece el diagnóstico.', 'ticket', t.id, 'normal', null);
  perform private.notify('reception:' || t.id, t.assigned_to, 'equipment.received',
    'Equipo recibido: ' || t.code, 'El equipo ya está en el taller. Continúa con el diagnóstico.', 'ticket', t.id, 'normal', coalesce(auth.uid(), new.received_by));
  return null;
end $$;
create trigger receptions_notify_created after insert on public.receptions for each row execute function private.on_reception_created();

-- ---------------------------------------------------------------- 4) diagnóstico finalizado → cliente
create function private.on_diagnosis_finalized() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype;
begin
  select * into t from public.tickets where id = new.ticket_id;
  if not found then return null; end if;
  perform private.notify('diag:' || new.id || ':' || extract(epoch from new.finalized_at)::bigint, private.profile_of_customer(t.customer_id), 'diagnosis.ready',
    'Tu diagnóstico está listo', 'Ya puedes ver el resultado de la revisión de tu equipo.', 'ticket', t.id, 'high', null);
  return null;
end $$;
create trigger diagnostics_notify_finalized after update of finalized_at on public.diagnostics for each row
  when (new.finalized_at is not null and new.finalized_at is distinct from old.finalized_at) execute function private.on_diagnosis_finalized();

-- ---------------------------------------------------------------- 5) cambios de estado (matriz por estado nuevo)
create function private.notify_ticket_transition(t public.tickets, p_to public.ticket_status, p_actor uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_cust uuid := private.profile_of_customer(t.customer_id);
  v_key text := 'tr:' || t.id || ':' || p_to::text || ':' || (select count(*) from public.ticket_status_history where ticket_id = t.id and to_status = p_to);
begin
  if p_to = 'diagnosing' then
    perform private.notify(v_key, v_cust, 'diagnosis.started', 'Tu equipo está en diagnóstico', 'Un técnico lo está revisando para identificar la causa. No necesitas hacer nada por ahora.', 'ticket', t.id, 'normal', null);
    perform private.notify(v_key, t.assigned_to, 'task.diagnosis', 'Diagnóstico por completar: ' || t.code, 'Registra los hallazgos y finaliza el diagnóstico para preparar la propuesta.', 'ticket', t.id, 'normal', p_actor);
  elsif p_to = 'awaiting_part' then
    perform private.notify(v_key, v_cust, 'ticket.waiting_part', 'Estamos esperando un repuesto', 'Continuamos con tu reparación cuando llegue. Te avisaremos.', 'ticket', t.id, 'normal', null);
    perform private.notify_superadmins(v_key, 'ticket.blocked', 'Ticket en espera de repuesto: ' || t.code, 'La reparación está detenida hasta que llegue el repuesto.', 'ticket', t.id, 'high', p_actor);
  elsif p_to = 'in_service' then
    perform private.notify(v_key, v_cust, 'repair.started', 'Iniciamos la reparación de tu equipo', 'Estamos trabajando en tu equipo. No necesitas hacer nada por ahora.', 'ticket', t.id, 'normal', null);
  elsif p_to = 'ready' then
    perform private.notify(v_key, v_cust, 'ticket.ready', 'Tu equipo está listo', 'Coordinemos la entrega. Ábrelo para ver cómo.', 'ticket', t.id, 'high', null);
  elsif p_to = 'delivered' then
    perform private.notify(v_key, v_cust, 'ticket.delivered', 'Entrega confirmada', 'Gracias por confiar en TechnoUltra. Tus documentos y tu garantía están disponibles en tu servicio.', 'ticket', t.id, 'normal', null);
  elsif p_to = 'cancelled' then
    perform private.notify(v_key, v_cust, 'ticket.cancelled', 'Tu servicio fue cancelado', 'Si tienes dudas, escríbenos y lo revisamos contigo.', 'ticket', t.id, 'normal', null);
    perform private.notify(v_key, t.assigned_to, 'ticket.cancelled', 'Ticket cancelado: ' || t.code, 'El servicio fue cancelado.', 'ticket', t.id, 'normal', p_actor);
    perform private.notify_superadmins(v_key, 'ticket.cancelled', 'Ticket cancelado: ' || t.code, 'El servicio fue cancelado.', 'ticket', t.id, 'normal', p_actor);
  end if;
  -- 'received' (solicitud), 'awaiting_approval' (lo avisa la cotización) y 'testing' (interno) no generan aviso propio.
end $$;

-- Núcleo de transiciones: igual al de la migración 07, pero SIN el aviso genérico «Tu ticket X: Recibido/…» (ruidoso y confuso: «Recibido» no
-- significa que el equipo esté en el taller). Ahora llama a la matriz por estado.
create or replace function private.apply_transition(
  p_ticket uuid, p_to public.ticket_status, p_actor uuid, p_actor_role text, p_reason text, p_system boolean default false
) returns public.ticket_status
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; tr public.ticket_transitions%rowtype; v_min int; v_n int; v_reason text := nullif(btrim(p_reason), '');
begin
  select * into t from public.tickets where id = p_ticket and deleted_at is null for update;
  if not found then raise exception 'ticket_not_found' using errcode = 'P0002'; end if;
  select * into tr from public.ticket_transitions where from_status = t.status and to_status = p_to;
  if not found then raise exception 'invalid_transition: % -> %', t.status, p_to using errcode = 'P0001'; end if;
  if not p_system and not (p_actor_role::public.app_role = any (tr.allowed_roles)) then
    raise exception 'forbidden_transition' using errcode = '42501';
  end if;
  if tr.requires_reason and v_reason is null then raise exception 'reason_required' using errcode = '22023'; end if;

  -- precondiciones de negocio
  if p_to = 'diagnosing' and t.status = 'received' then
    if not exists (select 1 from public.receptions where ticket_id = t.id) then
      raise exception 'precondition_failed: reception_missing' using errcode = 'P0001';
    end if;
    select coalesce((select (value #>> '{}')::int from public.app_settings where key = 'reception.min_photos'), 0) into v_min;
    select count(*) into v_n from public.evidence where ticket_id = t.id and stage = 'reception' and deleted_at is null;
    if v_n < v_min then raise exception 'precondition_failed: reception_photos_missing' using errcode = 'P0001'; end if;
  elsif p_to = 'awaiting_approval' then
    if not exists (select 1 from public.quotes where ticket_id = t.id and status = 'sent') then
      raise exception 'precondition_failed: quote_not_sent' using errcode = 'P0001';
    end if;
  elsif p_to in ('in_service', 'awaiting_part') and t.status in ('awaiting_approval', 'awaiting_part', 'diagnosing') then
    if not exists (select 1 from public.quotes where ticket_id = t.id and status = 'approved')
       and not (t.status = 'diagnosing' and p_to = 'in_service'
                and exists (select 1 from public.services s where s.id = t.service_id and not s.requires_quote)) then
      raise exception 'precondition_failed: quote_not_approved' using errcode = 'P0001';
    end if;
  elsif p_to = 'ready' then
    if not exists (select 1 from public.checklist_runs where ticket_id = t.id) then
      raise exception 'precondition_failed: checklist_missing' using errcode = 'P0001';
    end if;
    if exists (
         select 1 from public.checklist_items ci
         where ci.run_id = (select id from public.checklist_runs where ticket_id = t.id order by created_at desc limit 1)
           and ci.is_required and ci.state in ('pending', 'fail')) then
      raise exception 'precondition_failed: checklist_incomplete' using errcode = 'P0001';
    end if;
  elsif p_to = 'delivered' then
    if not exists (select 1 from public.deliveries where ticket_id = t.id) then
      raise exception 'precondition_failed: delivery_record_missing' using errcode = 'P0001';
    end if;
  end if;

  update public.tickets set
    status = p_to,
    delivered_at = case when p_to = 'delivered' then now() else delivered_at end,
    cancelled_reason = case when p_to = 'cancelled' then left(v_reason, 500) else cancelled_reason end
  where id = t.id;
  insert into public.ticket_status_history (ticket_id, from_status, to_status, actor_id, actor_role, reason)
  values (t.id, t.status, p_to, p_actor, p_actor_role, left(v_reason, 500));
  perform private.write_audit(p_actor, p_actor_role, 'ticket.status_changed', 'tickets', t.id::text,
    jsonb_build_object('from', t.status, 'to', p_to, 'system', p_system));
  perform private.notify_ticket_transition(t, p_to, p_actor);
  if p_to = 'delivered' then perform private.on_delivered(t, p_actor); end if;
  return p_to;
end $$;

-- ---------------------------------------------------------------- 6) cotización: decisión y preguntas
create or replace function private.notify_ticket_staff(p_ticket uuid, p_type text, p_title text) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_q uuid; v_key text; v_cust uuid;
begin
  select * into t from public.tickets where id = p_ticket;
  if not found then return; end if;
  select id into v_q from public.quotes where ticket_id = p_ticket and status <> 'superseded' order by version desc limit 1;
  v_key := p_type || ':' || coalesce(v_q::text, t.id::text);
  v_cust := private.profile_of_customer(t.customer_id);
  if p_type = 'quote.question' then
    -- el técnico responsable la responde; sin técnico, la supervisa el SUPERADMIN
    if t.assigned_to is not null then
      perform private.notify(v_key, t.assigned_to, 'quote.question', p_title, 'Responde para que el cliente pueda decidir.', 'ticket', t.id, 'high', null);
    else
      perform private.notify_superadmins(v_key, 'quote.question', p_title, 'Responde para que el cliente pueda decidir.', 'ticket', t.id, 'high', null);
    end if;
  elsif p_type = 'quote.approved' then
    perform private.notify(v_key, v_cust, 'quote.decision', 'Registramos tu aprobación', 'Gracias. Si hay un saldo por pagar, lo verás en tu servicio; iniciaremos el trabajo según el estado de tu pago y de los repuestos.', 'ticket', t.id, 'high', null);
    perform private.notify(v_key, t.assigned_to, 'quote.approved', p_title, 'Ya puedes continuar con el servicio.', 'ticket', t.id, 'high', null);
    perform private.notify_superadmins(v_key, 'quote.approved', p_title, 'Cotización aprobada: seguimiento administrativo y de cobro.', 'ticket', t.id, 'normal', null);
  elsif p_type = 'quote.rejected' then
    perform private.notify(v_key, v_cust, 'quote.decision', 'Registramos tu decisión', 'Recibimos tu respuesta: no continuarás con la reparación. Si cambias de opinión, escríbenos.', 'ticket', t.id, 'normal', null);
    perform private.notify(v_key, t.assigned_to, 'quote.rejected', p_title, 'El cliente no continuará con la reparación.', 'ticket', t.id, 'normal', null);
    perform private.notify_superadmins(v_key, 'quote.rejected', p_title, 'Cotización rechazada: revisa el cierre del servicio.', 'ticket', t.id, 'high', null);
  else
    perform private.notify(v_key, t.assigned_to, p_type, p_title, null, 'ticket', t.id, 'normal', null);
  end if;
end $$;

-- ---------------------------------------------------------------- 7) pagos
-- El aviso de pago confirmado se crea una sola vez por pago (clave `payok:<id>`). El SUPERADMIN solo recibe los pagos MANUALES (conciliación):
-- un pago en línea ya viene verificado por el proveedor y no requiere acción.
create function private.notify_payment_approved(pay public.payments) returns void
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_cust uuid := private.profile_of_customer(pay.customer_id); v_key text := 'payok:' || pay.id; v_body text; v_amount text;
begin
  if pay.ticket_id is not null then select * into t from public.tickets where id = pay.ticket_id; end if;
  v_amount := '$' || to_char(pay.amount, 'FM999G999G999');
  v_body := case
    when pay.purpose in ('diagnosis', 'service') then 'Tu pago está confirmado. ' || private.modality_next_step(coalesce(t.modality::text, 'store'))
    when pay.purpose = 'quote' then 'Tu pago de la cotización está confirmado. Seguimos con tu servicio.'
    else 'Tu pago está confirmado. Te contactaremos para coordinar la entrega.' end;
  perform private.notify(v_key, v_cust, 'payment.approved', '¡Recibimos tu pago!', v_body, case when pay.ticket_id is not null then 'ticket' else 'payment' end, coalesce(pay.ticket_id, pay.id), 'high', null);
  if pay.purpose in ('diagnosis', 'service') and t.id is not null then
    perform private.notify(v_key, t.assigned_to, 'payment.cleared', 'Pago confirmado: ' || t.code, 'El pago ya está confirmado; puedes continuar con el servicio.', 'ticket', t.id, 'normal', pay.confirmed_by);
  end if;
  if pay.provider = 'manual' then
    perform private.notify_superadmins(v_key, 'payment.received', 'Pago manual registrado: ' || v_amount, 'Pago ' || coalesce(pay.method, 'manual') || ' registrado; revisa la conciliación si corresponde.', case when t.id is not null then 'ticket' else 'payment' end, coalesce(t.id, pay.id), 'normal', pay.confirmed_by);
  elsif pay.purpose = 'order' then
    perform private.notify_superadmins(v_key, 'order.paid', 'Nuevo pedido pagado: ' || v_amount, 'Hay un pedido pagado por atender.', 'payment', pay.id, 'high', null);
  end if;
end $$;

-- Liquidación única de un pago aprobado (idempotente): igual a la de la migración 30, con la matriz de avisos nueva.
create or replace function private.settle_payment(p_payment uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare pay public.payments%rowtype; v_quote uuid;
begin
  select * into pay from public.payments where id = p_payment;
  if not found or pay.status <> 'approved' then return; end if;
  if pay.purpose = 'order' then
    update public.orders set paid_at = coalesce(paid_at, now()) where id = pay.order_id;
    perform private.create_installation_tickets(pay.order_id);
  elsif pay.purpose = 'quote' then
    update public.quotes set paid_at = coalesce(paid_at, now()) where id = pay.quote_id;
  elsif pay.purpose = 'service' then
    update public.tickets set prepaid_at = coalesce(prepaid_at, now()), prepaid_amount = coalesce(prepaid_amount, pay.amount) where id = pay.ticket_id;
  else
    insert into public.diagnosis_credits (customer_id, ticket_id, payment_id, amount) values (pay.customer_id, pay.ticket_id, pay.id, pay.amount)
    on conflict (payment_id) do nothing;
    select id into v_quote from public.quotes where ticket_id = pay.ticket_id and status = 'draft';
    if v_quote is not null then perform private.recompute_quote(v_quote); end if;
  end if;
  perform private.notify_payment_approved(pay);
end $$;

-- Pago en línea que NO se completó: aviso al cliente (una vez por pago) e incidencia al SUPERADMIN (una por concepto y día, para no repetir por cada reintento).
create function private.on_payment_failed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_cust uuid := private.profile_of_customer(new.customer_id); v_target uuid := coalesce(new.ticket_id, new.quote_id, new.order_id, new.id);
begin
  perform private.notify('payfail:' || new.id, v_cust, 'payment.failed',
    case new.status when 'rejected' then 'No se pudo completar tu pago' when 'expired' then 'Tu pago venció' else 'Tu pago se canceló' end,
    case new.status when 'cancelled' then 'Cuando quieras, puedes volver a intentarlo desde tu servicio.' else 'Puedes intentarlo nuevamente desde tu servicio.' end,
    case when new.ticket_id is not null then 'ticket' else 'payment' end, coalesce(new.ticket_id, new.id), 'high', null);
  if new.status in ('rejected', 'expired') then
    perform private.notify_superadmins('payinc:' || v_target || ':' || new.purpose || ':' || (now() at time zone 'America/Bogota')::date,
      'payment.incident', 'Incidencia de pago en línea', 'Un pago no se completó (' || new.status::text || '). Contacta al cliente si lo necesita.',
      case when new.ticket_id is not null then 'ticket' else 'payment' end, coalesce(new.ticket_id, new.id), 'high', null);
  end if;
  return null;
end $$;
create trigger payments_notify_failed after update of status on public.payments for each row
  when (old.status = 'pending' and new.status in ('rejected', 'expired', 'cancelled') and new.provider = 'mercadopago') execute function private.on_payment_failed();

-- Transferencia registrada pero aún sin confirmar → el SUPERADMIN debe validarla.
create function private.on_manual_pending() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.notify_superadmins('transfer:' || new.id, 'payment.transfer_pending', 'Transferencia por validar',
    'Hay una transferencia registrada que espera tu confirmación.', case when new.ticket_id is not null then 'ticket' else 'payment' end, coalesce(new.ticket_id, new.id), 'high', new.confirmed_by);
  return null;
end $$;
create trigger payments_notify_manual_pending after insert on public.payments for each row
  when (new.provider = 'manual' and new.status = 'pending') execute function private.on_manual_pending();

-- ---------------------------------------------------------------- 8) tickets sin atender (lo ejecuta el cron)
create function public.notify_stale_tickets() returns int
language plpgsql security definer set search_path = '' as $$
declare r record; n int := 0; v_day text := ((now() at time zone 'America/Bogota')::date)::text;
begin
  for r in select t.id, t.code from public.tickets t
           where t.deleted_at is null and t.status = 'received' and t.assigned_to is null and t.created_at < now() - interval '4 hours' loop
    perform private.notify_superadmins('stale-unassigned:' || r.id || ':' || v_day, 'ticket.stale', 'Ticket sin asignar: ' || r.code,
      'Lleva más de 4 horas sin técnico asignado.', 'ticket', r.id, 'high', null);
    n := n + 1;
  end loop;
  for r in select t.id, t.code from public.tickets t
           where t.deleted_at is null and t.status = 'ready' and t.updated_at < now() - interval '3 days' loop
    perform private.notify_superadmins('stale-ready:' || r.id || ':' || v_day, 'ticket.stale', 'Equipo listo sin entregar: ' || r.code,
      'Lleva más de 3 días listo para entregar.', 'ticket', r.id, 'normal', null);
    n := n + 1;
  end loop;
  return n;
end $$;
revoke execute on function public.notify_stale_tickets() from public, anon, authenticated;
grant execute on function public.notify_stale_tickets() to service_role;

-- ---------------------------------------------------------------- 9) canales: qué merece correo y cómo se reclaman los envíos
-- Cliente: los hitos que cambian lo que debe saber o hacer. Personal: solo lo de prioridad alta (el resto vive en la app/push).
create or replace function private.email_worthy2(p_type text, p_priority text, p_role text) returns boolean
language sql immutable set search_path = '' as $$
  select case when p_role = 'client'
    then p_type in ('request.received', 'payment.approved', 'payment.failed', 'equipment.received', 'diagnosis.ready', 'quote.sent', 'quote.answered',
                    'quote.decision', 'ticket.ready', 'ticket.delivered', 'ticket.cancelled', 'document.available', 'maintenance.due', 'ticket.status_changed')
    else p_priority = 'high' end
$$;

drop function public.claim_email_notifications(int);
create function public.claim_email_notifications(p_limit int default 25)
returns table (id uuid, to_email text, full_name text, title text, body text, type text, entity_type text, entity_id uuid, recipient_role text)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select n.id from public.notifications n
    join public.profiles p on p.id = n.recipient_id and p.is_active and p.deleted_at is null
    left join public.notification_preferences np on np.profile_id = n.recipient_id
    where n.emailed_at is null and n.channel = 'in_app' and n.created_at > now() - interval '3 days'
      and private.email_worthy2(n.type, n.priority, p.role::text) and coalesce(np.email_enabled, true)
    order by n.created_at
    limit greatest(1, least(p_limit, 100))
    for update of n skip locked
  ), marked as (
    update public.notifications n set emailed_at = now() from picked where n.id = picked.id returning n.*
  )
  select m.id, p.email, p.full_name, m.title, m.body, m.type, m.entity_type, m.entity_id, p.role::text
  from marked m join public.profiles p on p.id = m.recipient_id;
end $$;
revoke execute on function public.claim_email_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_email_notifications(int) to service_role;

create or replace function public.skip_non_email_notifications() returns int
language plpgsql security definer set search_path = '' as $$
declare n int;
begin
  update public.notifications nn set emailed_at = now()
   from public.profiles p
   where p.id = nn.recipient_id and nn.emailed_at is null and not private.email_worthy2(nn.type, nn.priority, p.role::text);
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.skip_non_email_notifications() from public, anon, authenticated;
grant execute on function public.skip_non_email_notifications() to service_role;

-- Push: reclama avisos recientes de usuarios que activaron push y tienen un dispositivo suscrito. Hasta 3 intentos; nunca avisos de más de 6 h.
create function public.claim_push_notifications(p_limit int default 25)
returns table (notification_id uuid, recipient_id uuid, title text, body text, entity_type text, entity_id uuid, priority text, attempt int)
language plpgsql security definer set search_path = '' as $$
begin
  return query
  with picked as (
    select n.id from public.notifications n
    join public.profiles p on p.id = n.recipient_id and p.is_active and p.deleted_at is null
    join public.notification_preferences np on np.profile_id = n.recipient_id and np.push_enabled
    left join public.notification_deliveries d on d.notification_id = n.id and d.channel = 'push'
    where n.channel = 'in_app' and n.priority <> 'low' and n.created_at > now() - interval '6 hours'
      and exists (select 1 from public.push_subscriptions s where s.profile_id = n.recipient_id)
      and (d.id is null or (d.status in ('pending', 'failed') and d.attempts < 3 and d.updated_at < now() - interval '2 minutes'))
    order by n.created_at
    limit greatest(1, least(p_limit, 100))
    for update of n skip locked
  ), up as (
    insert into public.notification_deliveries (notification_id, channel, status, attempts)
    select id, 'push', 'pending', 1 from picked
    on conflict on constraint notification_deliveries_notification_id_channel_key do update set attempts = public.notification_deliveries.attempts + 1, status = 'pending', updated_at = now()
    returning public.notification_deliveries.notification_id as nid, public.notification_deliveries.attempts as att
  )
  select n.id, n.recipient_id, n.title, n.body, n.entity_type, n.entity_id, n.priority, up.att
  from public.notifications n join up on up.nid = n.id;
end $$;
revoke execute on function public.claim_push_notifications(int) from public, anon, authenticated;
grant execute on function public.claim_push_notifications(int) to service_role;

-- Registro del resultado de un envío (correo o push). Solo el servidor.
create function public.record_delivery(p_notification uuid, p_channel text, p_status text, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_channel not in ('email', 'push') or p_status not in ('sent', 'failed', 'skipped') then raise exception 'invalid_delivery' using errcode = '22023'; end if;
  insert into public.notification_deliveries (notification_id, channel, status, attempts, last_error, sent_at)
  values (p_notification, p_channel, p_status, 1, left(p_error, 300), case when p_status = 'sent' then now() end)
  on conflict on constraint notification_deliveries_notification_id_channel_key do update
    set status = excluded.status, last_error = excluded.last_error, sent_at = case when excluded.status = 'sent' then now() else public.notification_deliveries.sent_at end,
        attempts = greatest(public.notification_deliveries.attempts, 1);
end $$;
revoke execute on function public.record_delivery(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.record_delivery(uuid, text, text, text) to service_role;

-- Las funciones internas nuevas solo las ejecutan otras funciones SECURITY DEFINER y los disparadores, nunca la API.
revoke execute on function
  private.profile_of_customer(uuid),
  private.notify(text, uuid, text, text, text, text, uuid, text, uuid),
  private.notify_superadmins(text, text, text, text, text, uuid, text, uuid),
  private.modality_next_step(text),
  private.on_ticket_created(), private.on_ticket_assigned(), private.on_reception_created(), private.on_diagnosis_finalized(),
  private.notify_ticket_transition(public.tickets, public.ticket_status, uuid),
  private.notify_payment_approved(public.payments),
  private.on_payment_failed(), private.on_manual_pending(),
  private.email_worthy2(text, text, text)
  from public, anon, authenticated;
