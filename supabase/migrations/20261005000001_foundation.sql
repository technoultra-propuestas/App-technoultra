-- FASE 1 · 01 · Fundaciones: esquema privado, privilegios por defecto, enums, utilidades y auditoría.
-- Principio: nada es accesible por defecto. Cada tabla/función concede permisos de forma explícita (migración 09).

create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- Los objetos futuros nacen SIN acceso para anon/authenticated/PUBLIC.
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;
alter default privileges for role postgres in schema public revoke all on sequences from anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres in schema private revoke execute on functions from public, anon, authenticated;

-- ---------------------------------------------------------------- enums
create type public.app_role as enum ('client', 'technician', 'admin');
create type public.ticket_status as enum
  ('received', 'diagnosing', 'awaiting_approval', 'awaiting_part', 'in_service', 'testing', 'ready', 'delivered', 'cancelled');
create type public.service_modality as enum ('store', 'pickup', 'home', 'remote');
create type public.service_kind as enum ('technical', 'digital');
create type public.price_mode as enum ('fixed', 'from', 'quote');
create type public.request_status as enum ('pending', 'scheduled', 'converted', 'cancelled', 'rejected');
create type public.quote_status as enum ('draft', 'sent', 'clarification', 'approved', 'rejected', 'expired', 'superseded');
create type public.item_kind as enum ('service', 'product', 'custom');
create type public.payment_status as enum ('pending', 'approved', 'rejected', 'cancelled', 'refunded', 'expired');
create type public.payment_provider as enum ('mercadopago', 'manual');
create type public.order_status as enum ('new', 'preparing', 'shipped', 'delivered', 'cancelled');
create type public.warranty_kind as enum ('product', 'labor');
create type public.warranty_status as enum ('active', 'expired', 'void');
create type public.document_type as enum
  ('reception', 'diagnosis', 'quote', 'authorization', 'checklist', 'delivery', 'warranty_product', 'warranty_labor',
   'recommendations', 'maintenance', 'receipt', 'other');
create type public.document_status as enum ('draft', 'generated', 'sent', 'viewed', 'signed', 'rejected', 'superseded');
create type public.crm_status as enum
  ('pending', 'contacted', 'interested', 'scheduled', 'done', 'no_answer', 'not_interested');
create type public.crm_task_type as enum ('maintenance', 'warranty', 'project', 'followup');
create type public.contact_channel as enum ('whatsapp', 'call', 'email', 'visit', 'app');
create type public.evidence_stage as enum ('reception', 'diagnosis', 'service', 'testing', 'delivery');
create type public.component_state as enum ('ok', 'review', 'fail');
create type public.check_state as enum ('pending', 'pass', 'fail', 'na');
create type public.event_type as enum
  ('reception', 'diagnosis', 'delivery', 'maintenance', 'warranty', 'crm', 'visit');
create type public.project_status as enum ('lead', 'scoped', 'in_progress', 'review', 'delivered', 'paused', 'cancelled');
create type public.notification_status as enum ('pending', 'sent', 'failed', 'read');
create type public.legal_status as enum ('draft', 'published', 'retired');

-- ---------------------------------------------------------------- utilidades
create function private.set_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at := now(); return new; end $$;

-- Tablas de evidencia: ni UPDATE ni DELETE ni TRUNCATE, para NADIE (incluido service_role / postgres).
create function private.forbid_mutation() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'immutable_table: % no admite % (solo INSERT)', tg_table_name, tg_op using errcode = '42501';
end $$;

-- Consecutivos legibles por prefijo y año (TU-2026-00001). Bloqueo de fila: sin duplicados.
create table private.counters (
  prefix text not null,
  year int not null,
  last_value int not null default 0,
  primary key (prefix, year)
);

create function private.next_code(p_prefix text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_year int := extract(year from now() at time zone 'America/Bogota')::int; v_n int;
begin
  insert into private.counters as c (prefix, year, last_value) values (p_prefix, v_year, 1)
  on conflict (prefix, year) do update set last_value = c.last_value + 1
  returning last_value into v_n;
  return p_prefix || '-' || v_year || '-' || lpad(v_n::text, 5, '0');
end $$;

-- Token aleatorio no adivinable (seguimiento público). Alfabeto sin caracteres ambiguos.
create function private.rand_token(p_len int default 12) returns text
language plpgsql security definer set search_path = '' as $$
declare a constant text := 'abcdefghjkmnpqrstuvwxyz23456789'; b bytea := extensions.gen_random_bytes(p_len); r text := ''; i int;
begin
  for i in 0 .. p_len - 1 loop r := r || substr(a, 1 + (get_byte(b, i) % 31), 1); end loop;
  return r;
end $$;

-- Solo el propietario de las funciones (postgres) o service_role. Las funciones SECURITY DEFINER de
-- este proyecto se ejecutan como postgres; las peticiones de PostgREST (authenticated/anon) no.
create function private.is_privileged_session() returns boolean
language sql stable set search_path = '' as $$
  select current_user in ('postgres', 'supabase_admin', 'service_role')
$$;

-- ---------------------------------------------------------------- auditoría (insert-only + cadena de hashes)
create table public.audit_logs (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor_id uuid,
  actor_role text,
  action text not null check (char_length(action) between 3 and 80),
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) < 16384),
  ip inet,
  prev_hash bytea,
  row_hash bytea not null
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id, at desc);
create index audit_logs_actor_idx on public.audit_logs (actor_id, at desc);
create index audit_logs_at_idx on public.audit_logs (at desc);
alter table public.audit_logs enable row level security;
create trigger audit_logs_immutable before update or delete on public.audit_logs
  for each row execute function private.forbid_mutation();
create trigger audit_logs_no_truncate before truncate on public.audit_logs
  for each statement execute function private.forbid_mutation();

create function private.request_ip() returns inet
language plpgsql stable set search_path = '' as $$
declare h text;
begin
  h := split_part(coalesce(current_setting('request.headers', true)::jsonb ->> 'x-forwarded-for', ''), ',', 1);
  return nullif(btrim(h), '')::inet;
exception when others then return null;
end $$;

-- Única vía de escritura de auditoría. Nunca pasar secretos ni PII en p_metadata.
create function private.write_audit(
  p_actor uuid, p_role text, p_action text, p_entity_type text, p_entity_id text, p_metadata jsonb default '{}'::jsonb
) returns void
language plpgsql security definer set search_path = '' as $$
declare v_prev bytea; v_at timestamptz := clock_timestamp(); v_hash bytea;
begin
  perform pg_advisory_xact_lock(hashtext('audit_logs_chain'));
  select row_hash into v_prev from public.audit_logs order by id desc limit 1;
  v_hash := extensions.digest(
    coalesce(v_prev, '\x'::bytea) || convert_to(
      concat_ws('|', v_at::text, coalesce(p_actor::text, ''), coalesce(p_role, ''), p_action, p_entity_type,
                coalesce(p_entity_id, ''), coalesce(p_metadata, '{}'::jsonb)::text), 'utf8'),
    'sha256');
  insert into public.audit_logs (at, actor_id, actor_role, action, entity_type, entity_id, metadata, ip, prev_hash, row_hash)
  values (v_at, p_actor, p_role, p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb),
          private.request_ip(), v_prev, v_hash);
end $$;

-- Verifica la cadena de hashes (detección de manipulación). Solo servicio.
create function private.verify_audit_chain() returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare r record; v_prev bytea := null; v_calc bytea;
begin
  for r in select * from public.audit_logs order by id loop
    v_calc := extensions.digest(
      coalesce(v_prev, '\x'::bytea) || convert_to(
        concat_ws('|', r.at::text, coalesce(r.actor_id::text, ''), coalesce(r.actor_role, ''), r.action, r.entity_type,
                  coalesce(r.entity_id, ''), r.metadata::text), 'utf8'),
      'sha256');
    if r.row_hash is distinct from v_calc or r.prev_hash is distinct from v_prev then return false; end if;
    v_prev := r.row_hash;
  end loop;
  return true;
end $$;

-- Trigger genérico. Argumento 0: 'keys' (solo nombres de columnas cambiadas; tablas con PII)
-- o 'values' (old/new; precios/estados). No registra contenido en INSERT/DELETE.
create function private.audit_trigger() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_old jsonb; v_new jsonb; v_changed jsonb := '{}'::jsonb; k text; v_mode text := coalesce(tg_argv[0], 'keys');
        v_id text; v_role text;
begin
  v_new := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  v_old := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  v_id := coalesce(v_new ->> 'id', v_old ->> 'id', v_new ->> 'key', v_old ->> 'key');
  if tg_op = 'UPDATE' then
    for k in select key from jsonb_each(v_new) where (v_new -> key) is distinct from (v_old -> key) and key <> 'updated_at' loop
      v_changed := v_changed || case when v_mode = 'values'
        then jsonb_build_object(k, jsonb_build_object('old', v_old -> k, 'new', v_new -> k))
        else jsonb_build_object(k, true) end;
    end loop;
    if v_changed = '{}'::jsonb then return new; end if;
  end if;
  select p.role::text into v_role from public.profiles p where p.id = auth.uid();
  perform private.write_audit(auth.uid(), v_role, lower(tg_table_name || '.' || tg_op), tg_table_name, v_id,
    case when tg_op = 'UPDATE' then jsonb_build_object('changed', v_changed) else '{}'::jsonb end);
  return coalesce(new, old);
end $$;
