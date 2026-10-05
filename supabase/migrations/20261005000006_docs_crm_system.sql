-- FASE 1 · 06 · Documentos, firmas, legal, CRM, agenda, mantenimiento y notificaciones.

-- ---------------------------------------------------------------- legal (versionado, aceptación inmutable)
create table public.legal_documents (
  id uuid primary key default gen_random_uuid(),
  slug text not null check (slug in ('terms', 'privacy', 'data_policy', 'warranty_policy', 'service_terms', 'purchase_terms', 'returns_policy', 'consents')),
  version int not null check (version > 0),
  title text not null check (char_length(title) between 3 and 160),
  content text not null check (char_length(content) > 0),
  content_sha256 text not null check (content_sha256 ~ '^[0-9a-f]{64}$'),
  status public.legal_status not null default 'draft',
  requires_acceptance boolean not null default true,
  published_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  unique (slug, version),
  check ((status = 'draft') = (published_at is null))
);
create unique index legal_one_published on public.legal_documents (slug) where status = 'published';
-- El hash se calcula SIEMPRE en base de datos. Una versión publicada es inmutable (solo puede pasar a retired).
create function private.guard_legal() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then raise exception 'immutable_legal_version' using errcode = '42501'; end if;
    return old;
  end if;
  if tg_op = 'UPDATE' and old.status <> 'draft' then
    if (new.slug, new.version, new.title, new.content, new.content_sha256, new.published_at, new.requires_acceptance)
       is distinct from (old.slug, old.version, old.title, old.content, old.content_sha256, old.published_at, old.requires_acceptance)
       or (old.status = 'retired' and new.status <> 'retired')
       or (old.status = 'published' and new.status = 'draft') then
      raise exception 'immutable_legal_version' using errcode = '42501';
    end if;
    return new;
  end if;
  new.content_sha256 := encode(extensions.digest(convert_to(new.content, 'utf8'), 'sha256'), 'hex');
  if new.status = 'published' then new.published_at := coalesce(new.published_at, now()); end if;
  return new;
end $$;
create trigger legal_guard before insert or update or delete on public.legal_documents for each row execute function private.guard_legal();

create table public.legal_acceptances (
  id bigint generated always as identity primary key,
  profile_id uuid not null references public.profiles (id) on delete restrict,
  legal_document_id uuid not null references public.legal_documents (id) on delete restrict,
  accepted_at timestamptz not null default now(),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  unique (profile_id, legal_document_id)
);
create trigger legal_acceptances_immutable before update or delete on public.legal_acceptances
  for each row execute function private.forbid_mutation();

-- ---------------------------------------------------------------- documentos y firma
create table public.documents (
  id uuid primary key default gen_random_uuid(),
  code text not null unique default private.next_code('DOC'),
  doc_type public.document_type not null,
  version int not null default 1 check (version > 0),
  status public.document_status not null default 'generated',
  title text not null check (char_length(title) between 3 and 160),
  customer_id uuid not null references public.customers (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  quote_id uuid references public.quotes (id) on delete restrict,
  order_id uuid references public.orders (id) on delete restrict,
  project_id uuid references public.digital_projects (id) on delete restrict,
  equipment_id uuid references public.equipment (id) on delete restrict,
  warranty_id uuid references public.warranties (id) on delete restrict,
  storage_path text not null check (char_length(storage_path) <= 300),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  supersedes_id uuid references public.documents (id) on delete restrict,
  generated_by uuid,
  generated_at timestamptz not null default now(),
  sent_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  rejected_at timestamptz,
  created_at timestamptz not null default now(),
  check (status <> 'signed' or signed_at is not null)
);
create index documents_customer_idx on public.documents (customer_id, created_at desc);
create index documents_ticket_idx on public.documents (ticket_id);
-- Contenido y estado firmado son inmutables; una corrección crea una versión nueva.
create function private.guard_document() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then raise exception 'immutable_document' using errcode = '42501'; end if;
  if (new.doc_type, new.version, new.storage_path, new.sha256, new.customer_id, new.code, new.generated_at)
     is distinct from (old.doc_type, old.version, old.storage_path, old.sha256, old.customer_id, old.code, old.generated_at) then
    raise exception 'immutable_document' using errcode = '42501';
  end if;
  if old.status = 'signed' and new.status is distinct from old.status and new.status <> 'superseded' then
    raise exception 'signed_document_final' using errcode = '42501';
  end if;
  return new;
end $$;
create trigger documents_guard before update or delete on public.documents for each row execute function private.guard_document();

create table public.document_signatures (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete restrict,
  signer_profile_id uuid not null references public.profiles (id) on delete restrict,
  signer_name text not null check (char_length(btrim(signer_name)) between 2 and 120),
  consent_text text not null check (char_length(consent_text) between 10 and 2000),
  signature_ref text not null check (char_length(signature_ref) <= 300),
  document_sha256 text not null check (document_sha256 ~ '^[0-9a-f]{64}$'),
  signed_at timestamptz not null default now(),
  ip inet,
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  unique (document_id, signer_profile_id)
);
create trigger document_signatures_immutable before update or delete on public.document_signatures
  for each row execute function private.forbid_mutation();
-- La firma solo es válida si el hash coincide con el del documento vigente; marca el documento como firmado.
create function private.apply_signature() returns trigger
language plpgsql security definer set search_path = '' as $$
declare d public.documents%rowtype;
begin
  select * into d from public.documents where id = new.document_id for update;
  if d.sha256 <> new.document_sha256 then raise exception 'document_hash_mismatch' using errcode = '23514'; end if;
  if d.status in ('signed', 'superseded', 'rejected', 'draft') then raise exception 'document_not_signable' using errcode = '23514'; end if;
  update public.documents set status = 'signed', signed_at = new.signed_at where id = d.id;
  return new;
end $$;
create trigger document_signatures_apply before insert on public.document_signatures
  for each row execute function private.apply_signature();

-- ---------------------------------------------------------------- CRM y agenda
create table public.crm_tasks (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  equipment_id uuid references public.equipment (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  project_id uuid references public.digital_projects (id) on delete restrict,
  task_type public.crm_task_type not null,
  status public.crm_status not null default 'pending',
  due_at timestamptz not null,
  assigned_to uuid references public.profiles (id) on delete restrict,
  note text check (note is null or char_length(note) <= 500),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index crm_tasks_due_idx on public.crm_tasks (status, due_at);
create index crm_tasks_assigned_idx on public.crm_tasks (assigned_to, due_at);
create trigger crm_tasks_updated before update on public.crm_tasks for each row execute function private.set_updated_at();

create table public.crm_interactions (
  id bigint generated always as identity primary key,
  task_id uuid not null references public.crm_tasks (id) on delete restrict,
  channel public.contact_channel not null,
  result public.crm_status not null,
  note text check (note is null or char_length(note) <= 1000),
  next_action text check (next_action is null or char_length(next_action) <= 300),
  next_action_at timestamptz,
  actor_id uuid default auth.uid(),
  created_at timestamptz not null default now()
);
create index crm_interactions_task_idx on public.crm_interactions (task_id, created_at);
create trigger crm_interactions_immutable before update or delete on public.crm_interactions
  for each row execute function private.forbid_mutation();

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  event_type public.event_type not null,
  title text not null check (char_length(title) between 2 and 160),
  starts_at timestamptz not null,
  duration_minutes int not null default 60 check (duration_minutes between 5 and 1440),
  customer_id uuid references public.customers (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  crm_task_id uuid references public.crm_tasks (id) on delete restrict,
  assigned_to uuid references public.profiles (id) on delete restrict,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index calendar_events_starts_idx on public.calendar_events (starts_at);
create index calendar_events_assigned_idx on public.calendar_events (assigned_to, starts_at);
create trigger calendar_events_updated before update on public.calendar_events for each row execute function private.set_updated_at();

create table public.maintenance_plans (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete restrict,
  equipment_id uuid not null references public.equipment (id) on delete restrict,
  ticket_id uuid references public.tickets (id) on delete restrict,
  crm_task_id uuid references public.crm_tasks (id) on delete restrict,
  due_at timestamptz not null,
  interval_months int not null default 6 check (interval_months between 1 and 36),
  status text not null default 'scheduled' check (status in ('scheduled', 'reminded', 'done', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index maintenance_plans_due_idx on public.maintenance_plans (status, due_at);
create trigger maintenance_plans_updated before update on public.maintenance_plans for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------- notificaciones
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  channel text not null default 'in_app' check (channel in ('in_app', 'email', 'push', 'whatsapp')),
  type text not null check (char_length(type) between 3 and 60),
  title text not null check (char_length(title) between 1 and 160),
  body text check (body is null or char_length(body) <= 500),
  entity_type text,
  entity_id uuid,
  status public.notification_status not null default 'pending',
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx on public.notifications (recipient_id) where read_at is null;

create table public.notification_preferences (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  in_app_enabled boolean not null default true,
  email_enabled boolean not null default true,
  push_enabled boolean not null default false,
  whatsapp_enabled boolean not null default false,
  updated_at timestamptz not null default now()
);
create trigger notification_prefs_updated before update on public.notification_preferences for each row execute function private.set_updated_at();

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique check (char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth_key text not null check (char_length(auth_key) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);
