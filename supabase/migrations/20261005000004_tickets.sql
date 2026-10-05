-- FASE 1 · 04 · Equipos, solicitudes, tickets, recepción, evidencias, diagnóstico y checklist.

create table public.equipment (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  type text not null check (type in ('laptop', 'desktop', 'all_in_one', 'printer', 'network', 'other')),
  brand text not null check (char_length(btrim(brand)) between 1 and 60),
  model text not null check (char_length(btrim(model)) between 1 and 80),
  serial text check (serial is null or char_length(serial) <= 60),
  ram text check (ram is null or char_length(ram) <= 30),
  storage text check (storage is null or char_length(storage) <= 40),
  year smallint check (year is null or year between 1990 and 2100),
  notes text check (notes is null or char_length(notes) <= 500),
  next_maintenance_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index equipment_customer_idx on public.equipment (customer_id) where deleted_at is null;
create trigger equipment_updated before update on public.equipment for each row execute function private.set_updated_at();

create table public.service_requests (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('SOL'),
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_id uuid not null references public.services (id) on delete restrict,
  equipment_id uuid references public.equipment (id) on delete restrict,
  modality public.service_modality not null,
  address_id uuid references public.addresses (id) on delete restrict,
  problem_description text not null check (char_length(btrim(problem_description)) between 5 and 2000),
  symptoms text[] not null default '{}' check (cardinality(symptoms) <= 10),
  preferred_at timestamptz,
  status public.request_status not null default 'pending',
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index service_requests_customer_idx on public.service_requests (customer_id, created_at desc);
create index service_requests_status_idx on public.service_requests (status, created_at);
create trigger service_requests_updated before update on public.service_requests for each row execute function private.set_updated_at();

-- Cobertura y coherencia validadas en BASE DE DATOS: no se pueden saltar manipulando el frontend.
create function private.validate_service_request() returns trigger
language plpgsql security definer set search_path = '' as $$
declare s public.services%rowtype; a public.addresses%rowtype; e public.equipment%rowtype;
begin
  select * into s from public.services where id = new.service_id and is_active and deleted_at is null;
  if not found then raise exception 'service_unavailable' using errcode = '23514'; end if;
  if not (new.modality = any (s.allowed_modalities)) then raise exception 'modality_not_allowed_for_service' using errcode = '23514'; end if;
  if s.requires_equipment then
    if new.equipment_id is null then raise exception 'equipment_required' using errcode = '23514'; end if;
    select * into e from public.equipment where id = new.equipment_id and deleted_at is null;
    if not found or e.customer_id <> new.customer_id then raise exception 'equipment_not_owned' using errcode = '42501'; end if;
  end if;
  if new.modality <> 'remote' then
    if new.address_id is null then raise exception 'address_required_for_physical_service' using errcode = '23514'; end if;
    select * into a from public.addresses where id = new.address_id and deleted_at is null;
    if not found or a.customer_id <> new.customer_id then raise exception 'address_not_owned' using errcode = '42501'; end if;
    if not public.check_coverage(a.dane_code, new.modality) then raise exception 'out_of_coverage' using errcode = 'P0001'; end if;
  end if;
  return new;
end $$;
create trigger service_requests_validate before insert on public.service_requests
  for each row execute function private.validate_service_request();

create table public.tickets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('TU'),
  tracking_token text not null unique default private.rand_token(12),
  customer_id uuid not null references public.customers (id) on delete restrict,
  equipment_id uuid references public.equipment (id) on delete restrict,
  service_request_id uuid unique references public.service_requests (id) on delete restrict,
  service_id uuid references public.services (id) on delete restrict,
  assigned_to uuid references public.profiles (id) on delete restrict,
  status public.ticket_status not null default 'received',
  modality public.service_modality not null,
  problem text not null check (char_length(btrim(problem)) between 5 and 2000),
  needs_part boolean not null default false,
  received_at timestamptz not null default now(),
  delivered_at timestamptz,
  cancelled_reason text check (cancelled_reason is null or char_length(cancelled_reason) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check ((status = 'delivered') = (delivered_at is not null)),
  check (status <> 'cancelled' or cancelled_reason is not null)
);
create index tickets_customer_idx on public.tickets (customer_id, created_at desc);
create index tickets_assigned_idx on public.tickets (assigned_to, status) where deleted_at is null;
create index tickets_status_idx on public.tickets (status, created_at desc) where deleted_at is null;
create trigger tickets_updated before update on public.tickets for each row execute function private.set_updated_at();

-- El estado solo cambia por public.transition_ticket / funciones de flujo (propietario postgres).
create function private.guard_ticket() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'UPDATE' and (new.status, new.assigned_to, new.delivered_at, new.cancelled_reason, new.code, new.tracking_token,
        new.customer_id, new.created_by)
     is distinct from (old.status, old.assigned_to, old.delivered_at, old.cancelled_reason, old.code, old.tracking_token,
        old.customer_id, old.created_by)
     and not private.is_privileged_session() then
    raise exception 'privileged_column' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger tickets_guard before update on public.tickets for each row execute function private.guard_ticket();

-- Coherencia al crear: equipo y solicitud pertenecen al mismo cliente; técnico asignado debe ser personal activo.
create function private.validate_ticket() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.equipment_id is not null and not exists (
       select 1 from public.equipment e where e.id = new.equipment_id and e.customer_id = new.customer_id) then
    raise exception 'equipment_not_owned' using errcode = '42501';
  end if;
  if new.service_request_id is not null and not exists (
       select 1 from public.service_requests r where r.id = new.service_request_id and r.customer_id = new.customer_id
         and r.status in ('pending', 'scheduled')) then
    raise exception 'invalid_service_request' using errcode = '23514';
  end if;
  if new.assigned_to is not null and not exists (
       select 1 from public.profiles p where p.id = new.assigned_to and p.role in ('technician', 'admin') and p.is_active and p.deleted_at is null) then
    raise exception 'assignee_not_staff' using errcode = '23514';
  end if;
  return new;
end $$;
create trigger tickets_validate before insert on public.tickets for each row execute function private.validate_ticket();

create table public.ticket_status_history (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  from_status public.ticket_status,
  to_status public.ticket_status not null,
  actor_id uuid,
  actor_role text,
  reason text check (reason is null or char_length(reason) <= 500),
  created_at timestamptz not null default now()
);
create index ticket_history_ticket_idx on public.ticket_status_history (ticket_id, created_at);
create trigger ticket_history_immutable before update or delete on public.ticket_status_history
  for each row execute function private.forbid_mutation();

create function private.ticket_created() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.ticket_status_history (ticket_id, from_status, to_status, actor_id, actor_role)
  values (new.id, null, new.status, auth.uid(), (select p.role::text from public.profiles p where p.id = auth.uid()));
  if new.service_request_id is not null then
    update public.service_requests set status = 'converted' where id = new.service_request_id;
  end if;
  return new;
end $$;
create trigger tickets_created after insert on public.tickets for each row execute function private.ticket_created();

-- Matriz de transiciones válidas (configuración verificable; cambia solo por migración).
create table public.ticket_transitions (
  from_status public.ticket_status not null,
  to_status public.ticket_status not null,
  allowed_roles public.app_role[] not null check (cardinality(allowed_roles) > 0),
  requires_reason boolean not null default false,
  primary key (from_status, to_status),
  check (from_status <> to_status)
);
insert into public.ticket_transitions (from_status, to_status, allowed_roles, requires_reason) values
  ('received',          'diagnosing',        '{technician,admin}', false),
  ('diagnosing',        'awaiting_approval', '{technician,admin}', false),
  ('diagnosing',        'in_service',        '{technician,admin}', false),
  ('awaiting_approval', 'in_service',        '{technician,admin}', false),
  ('awaiting_approval', 'awaiting_part',     '{technician,admin}', false),
  ('awaiting_approval', 'diagnosing',        '{technician,admin}', true),
  ('awaiting_part',     'in_service',        '{technician,admin}', false),
  ('in_service',        'awaiting_part',     '{technician,admin}', true),
  ('in_service',        'testing',           '{technician,admin}', false),
  ('testing',           'in_service',        '{technician,admin}', true),
  ('testing',           'ready',             '{technician,admin}', false),
  ('ready',             'delivered',         '{technician,admin}', false),
  ('received',          'cancelled',         '{admin}', true),
  ('diagnosing',        'cancelled',         '{admin}', true),
  ('awaiting_approval', 'cancelled',         '{admin}', true),
  ('awaiting_part',     'cancelled',         '{admin}', true),
  ('in_service',        'cancelled',         '{admin}', true),
  ('testing',           'cancelled',         '{admin}', true),
  ('ready',             'cancelled',         '{admin}', true);

create table public.ticket_notes (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  author_id uuid default auth.uid(),
  kind text not null default 'note' check (kind in ('note', 'assignment', 'system')),
  visibility text not null default 'internal' check (visibility in ('internal', 'customer')),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index ticket_notes_ticket_idx on public.ticket_notes (ticket_id, created_at);
create trigger ticket_notes_immutable before update or delete on public.ticket_notes
  for each row execute function private.forbid_mutation();

create table public.equipment_history (
  id bigint generated always as identity primary key,
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  event_type text not null check (char_length(event_type) between 3 and 40),
  note text check (note is null or char_length(note) <= 500),
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index equipment_history_idx on public.equipment_history (equipment_id, created_at desc);
create trigger equipment_history_immutable before update or delete on public.equipment_history
  for each row execute function private.forbid_mutation();

create table public.receptions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets (id) on delete restrict,
  accessories text[] not null default '{}' check (cardinality(accessories) <= 20),
  visible_damage text[] not null default '{}' check (cardinality(visible_damage) <= 20),
  physical_condition text check (physical_condition is null or char_length(physical_condition) <= 500),
  reason text not null check (char_length(btrim(reason)) between 3 and 1000),
  observations text check (observations is null or char_length(observations) <= 1000),
  received_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger receptions_updated before update on public.receptions for each row execute function private.set_updated_at();

-- Evidencia (fotos/videos en Cloudinary). Solo el servidor inserta tras validar la subida firmada.
create table public.evidence (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  stage public.evidence_stage not null,
  slot text check (slot is null or slot in ('front', 'back', 'screen', 'serial', 'left', 'right', 'charger', 'damage', 'other')),
  media_kind text not null default 'photo' check (media_kind in ('photo', 'video')),
  cloudinary_public_id text not null unique,
  format text check (format is null or char_length(format) <= 10),
  bytes int check (bytes is null or bytes between 1 and 104857600),
  sha256 text check (sha256 is null or sha256 ~ '^[0-9a-f]{64}$'),
  uploaded_by uuid,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index evidence_ticket_idx on public.evidence (ticket_id, stage) where deleted_at is null;

create table public.diagnostics (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  version int not null default 1 check (version > 0),
  summary text not null check (char_length(btrim(summary)) between 3 and 4000),
  tests_performed text check (tests_performed is null or char_length(tests_performed) <= 4000),
  recommendations text check (recommendations is null or char_length(recommendations) <= 4000),
  suggested_parts text check (suggested_parts is null or char_length(suggested_parts) <= 1000),
  visible_to_customer boolean not null default false,
  technician_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (ticket_id, version)
);
create trigger diagnostics_updated before update on public.diagnostics for each row execute function private.set_updated_at();

create table public.diagnostic_items (
  id uuid primary key default gen_random_uuid(),
  diagnostic_id uuid not null references public.diagnostics (id) on delete cascade,
  component text not null check (char_length(component) between 2 and 60),
  state public.component_state not null,
  note text check (note is null or char_length(note) <= 500),
  unique (diagnostic_id, component)
);

-- Diagnóstico asistido por IA: SIEMPRE preliminar hasta validación humana. Solo el servidor inserta.
create table public.ai_diagnostics (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  service_request_id uuid references public.service_requests (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  model text not null,
  model_version text,
  prompt_version text not null,
  input jsonb not null check (pg_column_size(input) < 32768),
  output jsonb not null check (pg_column_size(output) < 32768),
  urgency text check (urgency in ('low', 'medium', 'high')),
  is_preliminary boolean not null default true check (is_preliminary),
  disclaimer text not null check (char_length(disclaimer) > 20),
  validation_status text not null default 'pending' check (validation_status in ('pending', 'validated', 'edited', 'rejected')),
  validated_by uuid,
  validated_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  check ((validation_status = 'pending') = (validated_at is null))
);
create index ai_diag_customer_idx on public.ai_diagnostics (customer_id, created_at desc);
create index ai_diag_ticket_idx on public.ai_diagnostics (ticket_id);

create table public.checklist_template_items (
  id uuid primary key default gen_random_uuid(),
  label text not null check (char_length(label) between 2 and 80),
  sort_order int not null default 0,
  is_required boolean not null default true,
  is_active boolean not null default true
);
insert into public.checklist_template_items (label, sort_order) values
  ('Encendido', 10), ('Pantalla', 20), ('Teclado', 30), ('Touchpad', 40), ('Puertos USB', 50), ('WiFi', 60),
  ('Bluetooth', 70), ('Audio', 80), ('Cámara', 90), ('Cargador', 100), ('Batería', 110), ('Almacenamiento', 120),
  ('Memoria RAM', 130), ('Temperaturas', 140), ('Drivers', 150), ('Windows', 160), ('Actualizaciones', 170),
  ('Pruebas finales', 180);

create table public.checklist_runs (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.tickets (id) on delete restrict,
  started_by uuid default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index checklist_runs_ticket_idx on public.checklist_runs (ticket_id, created_at desc);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.checklist_runs (id) on delete cascade,
  label text not null check (char_length(label) between 2 and 80),
  is_required boolean not null default true,
  state public.check_state not null default 'pending',
  note text check (note is null or char_length(note) <= 300),
  checked_by uuid,
  checked_at timestamptz,
  unique (run_id, label)
);

create table public.deliveries (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null unique references public.tickets (id) on delete restrict,
  received_by_name text not null check (char_length(btrim(received_by_name)) between 2 and 120),
  notes text check (notes is null or char_length(notes) <= 1000),
  next_maintenance_at timestamptz,
  delivered_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);
