-- FASE 1 · 09 · Privilegios explícitos (mínimo necesario), disparadores de auditoría y endurecimiento final.
-- RLS filtra FILAS; los GRANT por columna limitan QUÉ columnas puede escribir cada rol (anti mass-assignment).

-- 1) Reinicio total: nadie hereda permisos "por defecto".
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
grant usage on schema public to anon, authenticated;

-- 2) Funciones usadas dentro de políticas / triggers evaluados con el rol del usuario.
grant execute on function
  private.my_role(), private.is_admin(), private.is_technician(), private.is_staff(), private.my_customer_id(),
  private.has_permission(text), private.can_view_ticket(uuid), private.can_manage_ticket(uuid), private.can_view_customer(uuid),
  private.can_view_quote(uuid), private.can_manage_quote(uuid), private.can_view_document(uuid),
  private.is_privileged_session(), private.quote_status_of(uuid), private.catalog_price(public.item_kind, uuid)
to authenticated, service_role;
grant execute on function private.is_privileged_session() to anon;
-- Valores por defecto de columnas (se evalúan con el rol que inserta):
grant execute on function private.next_code(text), private.rand_token(int) to authenticated, service_role;

-- 3) RPC públicas (cada una valida identidad por sí misma).
grant execute on function public.check_coverage(text, public.service_modality) to anon, authenticated, service_role;
grant execute on function public.track_ticket(text) to anon, authenticated, service_role;
grant execute on function public.transition_ticket(uuid, public.ticket_status, text) to authenticated, service_role;
grant execute on function public.assign_ticket(uuid, uuid) to authenticated, service_role;
grant execute on function public.cancel_service_request(uuid) to authenticated, service_role;
grant execute on function public.accept_legal_document(uuid) to authenticated, service_role;
-- Solo servidor (el backend ya verificó que el solicitante es administrador):
grant execute on function public.admin_provision_staff(uuid, uuid, public.app_role, text, text, text) to service_role;
grant execute on function public.admin_set_user_active(uuid, uuid, boolean) to service_role;
grant execute on function private.write_audit(uuid, text, text, text, text, jsonb) to service_role;
grant execute on function private.verify_audit_chain() to service_role;

-- 4) Lectura pública (anon): solo catálogo, cobertura, textos legales publicados y ajustes públicos.
grant select on public.coverage_areas, public.service_categories, public.services, public.product_categories, public.products,
  public.product_service_links, public.legal_documents, public.app_settings to anon;

-- 5) Authenticated: SELECT acotado por RLS en todo lo que necesita leer…
grant select on
  public.profiles, public.customers, public.staff_members, public.addresses, public.permissions, public.role_permissions,
  public.coverage_areas, public.service_categories, public.services, public.product_categories, public.products,
  public.product_service_links, public.inventory, public.inventory_movements, public.app_settings, public.ticket_transitions,
  public.checklist_template_items, public.equipment, public.equipment_history, public.service_requests, public.tickets,
  public.ticket_status_history, public.ticket_notes, public.receptions, public.evidence, public.diagnostics,
  public.diagnostic_items, public.ai_diagnostics, public.checklist_runs, public.checklist_items, public.deliveries,
  public.digital_projects, public.project_status_history, public.project_files, public.project_comments, public.quotes,
  public.quote_items, public.quote_events, public.orders, public.order_items, public.payments, public.payment_events,
  public.warranties, public.documents, public.document_signatures, public.legal_documents, public.legal_acceptances,
  public.crm_tasks, public.crm_interactions, public.calendar_events, public.maintenance_plans, public.notifications,
  public.notification_preferences, public.push_subscriptions, public.audit_logs
to authenticated;

-- …y escritura únicamente por columnas permitidas (status, totales, ids de propietario, tokens: NUNCA desde el cliente).
grant update (full_name, avatar_url, onboarding_completed_at) on public.profiles to authenticated;
grant insert (full_name, phone, email, document_type, document_number, company_name) on public.customers to authenticated;
grant update (full_name, phone, email, document_type, document_number, company_name) on public.customers to authenticated;
grant update (job_title, phone, is_available) on public.staff_members to authenticated;
grant insert (customer_id, label, line1, line2, neighborhood, city_name, department, dane_code, latitude, longitude, notes, is_default)
  on public.addresses to authenticated;
grant update (label, line1, line2, neighborhood, city_name, department, dane_code, latitude, longitude, notes, is_default, deleted_at)
  on public.addresses to authenticated;

grant insert, update on public.coverage_areas, public.service_categories, public.services, public.product_categories, public.products to authenticated;
grant insert, delete on public.product_service_links to authenticated;
grant update (reorder_level) on public.inventory to authenticated;
grant insert (product_id, delta, reason, reference_type, reference_id, note) on public.inventory_movements to authenticated;
grant insert, update (value, description, is_public) on public.app_settings to authenticated;
grant insert, update on public.checklist_template_items to authenticated;

grant insert (customer_id, type, brand, model, serial, ram, storage, year, notes) on public.equipment to authenticated;
grant update (type, brand, model, serial, ram, storage, year, notes, deleted_at) on public.equipment to authenticated;
grant insert (customer_id, service_id, equipment_id, modality, address_id, problem_description, symptoms, preferred_at)
  on public.service_requests to authenticated;
grant insert (customer_id, equipment_id, service_request_id, service_id, modality, problem, assigned_to) on public.tickets to authenticated;
grant update (problem, needs_part, deleted_at) on public.tickets to authenticated;
grant insert (ticket_id, kind, visibility, body) on public.ticket_notes to authenticated;
grant insert (ticket_id, accessories, visible_damage, physical_condition, reason, observations) on public.receptions to authenticated;
grant update (accessories, visible_damage, physical_condition, reason, observations) on public.receptions to authenticated;
grant insert (ticket_id, version, summary, tests_performed, recommendations, suggested_parts, visible_to_customer) on public.diagnostics to authenticated;
grant update (summary, tests_performed, recommendations, suggested_parts, visible_to_customer) on public.diagnostics to authenticated;
grant insert (diagnostic_id, component, state, note), update (component, state, note) on public.diagnostic_items to authenticated;
grant insert (ticket_id) on public.checklist_runs to authenticated;
grant update (completed_at) on public.checklist_runs to authenticated;
grant insert (run_id, label, is_required), update (state, note) on public.checklist_items to authenticated;
grant insert (ticket_id, received_by_name, notes, next_maintenance_at) on public.deliveries to authenticated;

grant insert (customer_id, service_id, title, scope, status, progress, owner_id, starts_on, due_on, client_notes) on public.digital_projects to authenticated;
grant update (title, scope, status, progress, owner_id, starts_on, due_on, client_notes, deleted_at) on public.digital_projects to authenticated;
grant insert (project_id, name, storage_ref, visibility) on public.project_files to authenticated;
grant update (name, visibility, deleted_at) on public.project_files to authenticated;
grant insert (project_id, visibility, body) on public.project_comments to authenticated;

grant insert (ticket_id, project_id, customer_id, valid_until, notes, terms, needs_part) on public.quotes to authenticated;
grant update (valid_until, notes, terms, needs_part) on public.quotes to authenticated;
grant insert (quote_id, position, kind, service_id, product_id, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind),
  update (position, description, qty, unit_price, discount, tax_rate, warranty_days, warranty_kind), delete on public.quote_items to authenticated;

grant update (status) on public.orders to authenticated;
grant update (status, coverage, exclusions) on public.warranties to authenticated;
grant insert (slug, version, title, content, requires_acceptance, status), update (title, content, requires_acceptance, status) on public.legal_documents to authenticated;
grant insert (task_id, channel, result, note, next_action, next_action_at) on public.crm_interactions to authenticated;
grant insert, update on public.crm_tasks, public.calendar_events to authenticated;
grant update (status) on public.maintenance_plans to authenticated;
grant update (read_at) on public.notifications to authenticated;
grant insert (profile_id, in_app_enabled, email_enabled, push_enabled, whatsapp_enabled), update (in_app_enabled, email_enabled, push_enabled, whatsapp_enabled)
  on public.notification_preferences to authenticated;
grant insert (profile_id, endpoint, p256dh, auth_key, user_agent), delete on public.push_subscriptions to authenticated;

-- Las secuencias de identidad no se tocan desde la API (los inserts se hacen por funciones/triggers del propietario).

-- 6) service_role (solo servidor): acceso completo a tablas (omite RLS, NO omite triggers de inmutabilidad ni guardas).
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- ---------------------------------------------------------------- disparadores auxiliares
create function private.touch_setting() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_by := auth.uid(); new.updated_at := now(); return new; end $$;
create trigger app_settings_touch before insert or update on public.app_settings for each row execute function private.touch_setting();

create function private.stamp_checklist_item() returns trigger language plpgsql set search_path = '' as $$
begin
  if new.state is distinct from old.state then new.checked_by := auth.uid(); new.checked_at := now(); end if;
  return new;
end $$;
create trigger checklist_items_stamp before update on public.checklist_items for each row execute function private.stamp_checklist_item();

-- ---------------------------------------------------------------- auditoría de cambios
do $$
declare r record;
begin
  -- 'values': precios, estados y configuración (sin PII). 'keys': tablas con datos personales.
  for r in select * from (values
    ('profiles','keys'), ('customers','keys'), ('staff_members','keys'), ('addresses','keys'), ('equipment','keys'),
    ('tickets','values'), ('receptions','keys'), ('diagnostics','keys'), ('deliveries','keys'),
    ('coverage_areas','values'), ('service_categories','values'), ('services','values'), ('product_categories','values'),
    ('products','values'), ('product_service_links','values'), ('inventory','values'), ('inventory_movements','values'),
    ('app_settings','values'), ('role_permissions','values'), ('checklist_template_items','values'),
    ('quotes','values'), ('quote_items','values'), ('orders','values'), ('payments','values'), ('warranties','values'),
    ('documents','keys'), ('document_signatures','keys'), ('legal_documents','keys'), ('legal_acceptances','keys'),
    ('digital_projects','values'), ('crm_tasks','keys'), ('calendar_events','keys'), ('maintenance_plans','values'),
    ('service_requests','keys'), ('payment_events','keys'), ('ai_diagnostics','keys')
  ) as v(t, m) loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row execute function private.audit_trigger(%L)',
                   r.t || '_audit', r.t, r.m);
  end loop;
end $$;
