-- FASE 1 · 08 · Row Level Security. Ninguna tabla queda sin RLS; no hay USING (true) sobre datos privados.
-- Convención: (select private.f()) evita reevaluar la función por fila (initplan).

do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------- catálogo público + administración
create policy coverage_public_read on public.coverage_areas for select to anon, authenticated using (is_active);
create policy coverage_admin_all on public.coverage_areas for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy service_categories_public_read on public.service_categories for select to anon, authenticated using (is_active);
create policy service_categories_admin_all on public.service_categories for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));

create policy services_public_read on public.services for select to anon, authenticated using (is_active and deleted_at is null);
create policy services_admin_all on public.services for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));

create policy product_categories_public_read on public.product_categories for select to anon, authenticated using (is_active);
create policy product_categories_admin_all on public.product_categories for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));

create policy products_public_read on public.products for select to anon, authenticated using (is_active and deleted_at is null);
create policy products_admin_all on public.products for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));

create policy product_links_public_read on public.product_service_links for select to anon, authenticated
  using (exists (select 1 from public.products p where p.id = product_id and p.is_active and p.deleted_at is null));
create policy product_links_admin_all on public.product_service_links for all to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));

create policy inventory_staff_read on public.inventory for select to authenticated using ((select private.is_staff()));
create policy inventory_admin_update on public.inventory for update to authenticated
  using ((select private.has_permission('catalog.manage'))) with check ((select private.has_permission('catalog.manage')));
create policy inventory_movements_staff_read on public.inventory_movements for select to authenticated using ((select private.is_staff()));
create policy inventory_movements_admin_insert on public.inventory_movements for insert to authenticated
  with check ((select private.has_permission('catalog.manage')));

create policy app_settings_read on public.app_settings for select to anon, authenticated using (is_public or (select private.is_admin()));
create policy app_settings_admin_write on public.app_settings for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy permissions_admin_read on public.permissions for select to authenticated using ((select private.is_admin()));
create policy role_permissions_admin_read on public.role_permissions for select to authenticated using ((select private.is_admin()));
create policy ticket_transitions_staff_read on public.ticket_transitions for select to authenticated using ((select private.is_staff()));
create policy checklist_templates_staff_read on public.checklist_template_items for select to authenticated using ((select private.is_staff()));
create policy checklist_templates_admin_write on public.checklist_template_items for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------- identidad
create policy profiles_self_or_admin_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select private.is_admin()));
create policy profiles_self_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) and is_active) with check (id = (select auth.uid()));

create policy customers_read on public.customers for select to authenticated
  using ((deleted_at is null and (select private.can_view_customer(id))) or (select private.is_admin()));
create policy customers_staff_insert on public.customers for insert to authenticated
  with check ((select private.is_staff()) and profile_id is null);
create policy customers_update on public.customers for update to authenticated
  using ((select private.is_admin()) or (profile_id = (select auth.uid()) and deleted_at is null))
  with check ((select private.is_admin()) or (profile_id = (select auth.uid()) and deleted_at is null));

create policy staff_self_or_admin_read on public.staff_members for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_admin()));
create policy staff_admin_update on public.staff_members for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

create policy addresses_read on public.addresses for select to authenticated
  using ((deleted_at is null and (select private.can_view_customer(customer_id))) or (select private.is_admin()));
create policy addresses_insert on public.addresses for insert to authenticated
  with check (customer_id = (select private.my_customer_id()) or (select private.is_admin()));
create policy addresses_update on public.addresses for update to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin()))
  with check (customer_id = (select private.my_customer_id()) or (select private.is_admin()));

-- ---------------------------------------------------------------- equipos, solicitudes, tickets
create policy equipment_read on public.equipment for select to authenticated
  using ((deleted_at is null and (select private.can_view_customer(customer_id))) or (select private.is_admin()));
create policy equipment_insert on public.equipment for insert to authenticated
  with check (customer_id = (select private.my_customer_id()) or (select private.is_admin())
              or ((select private.is_technician()) and (select private.can_view_customer(customer_id))));
create policy equipment_update on public.equipment for update to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin()))
  with check (customer_id = (select private.my_customer_id()) or (select private.is_admin()));
create policy equipment_history_read on public.equipment_history for select to authenticated
  using (exists (select 1 from public.equipment e where e.id = equipment_id and (select private.can_view_customer(e.customer_id))));

create policy service_requests_read on public.service_requests for select to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin()));
create policy service_requests_client_insert on public.service_requests for insert to authenticated
  with check (customer_id = (select private.my_customer_id()) or (select private.is_admin()));

-- Las políticas SELECT de la propia tabla evalúan columnas directamente (una función STABLE no ve la fila recién insertada en INSERT ... RETURNING).
create policy tickets_read on public.tickets for select to authenticated
  using ((select private.is_admin())
         or (deleted_at is null and (customer_id = (select private.my_customer_id())
                                     or ((select private.is_technician()) and assigned_to = (select auth.uid())))));
create policy tickets_staff_insert on public.tickets for insert to authenticated
  with check ((select private.is_admin())
              or ((select private.is_technician()) and (assigned_to is null or assigned_to = (select auth.uid()))));
create policy tickets_manage_update on public.tickets for update to authenticated
  using ((select private.can_manage_ticket(id))) with check ((select private.can_manage_ticket(id)) and (deleted_at is null or (select private.is_admin())));

create policy ticket_history_read on public.ticket_status_history for select to authenticated using ((select private.can_view_ticket(ticket_id)));
create policy ticket_notes_read on public.ticket_notes for select to authenticated
  using ((select private.can_view_ticket(ticket_id)) and (visibility = 'customer' or (select private.is_staff())));
create policy ticket_notes_staff_insert on public.ticket_notes for insert to authenticated
  with check ((select private.can_manage_ticket(ticket_id)) and kind = 'note');

create policy receptions_read on public.receptions for select to authenticated using ((select private.can_view_ticket(ticket_id)));
create policy receptions_staff_insert on public.receptions for insert to authenticated with check ((select private.can_manage_ticket(ticket_id)));
create policy receptions_staff_update on public.receptions for update to authenticated
  using ((select private.can_manage_ticket(ticket_id))) with check ((select private.can_manage_ticket(ticket_id)));

create policy evidence_read on public.evidence for select to authenticated
  using (deleted_at is null and (select private.can_view_ticket(ticket_id))
         and (stage in ('reception', 'delivery') or (select private.is_staff())));

create policy diagnostics_read on public.diagnostics for select to authenticated
  using ((select private.can_view_ticket(ticket_id)) and ((select private.is_staff()) or visible_to_customer));
create policy diagnostics_staff_insert on public.diagnostics for insert to authenticated with check ((select private.can_manage_ticket(ticket_id)));
create policy diagnostics_staff_update on public.diagnostics for update to authenticated
  using ((select private.can_manage_ticket(ticket_id))) with check ((select private.can_manage_ticket(ticket_id)));
create policy diagnostic_items_read on public.diagnostic_items for select to authenticated
  using (exists (select 1 from public.diagnostics d where d.id = diagnostic_id and (select private.can_view_ticket(d.ticket_id))
                 and ((select private.is_staff()) or d.visible_to_customer)));
create policy diagnostic_items_staff_write on public.diagnostic_items for all to authenticated
  using (exists (select 1 from public.diagnostics d where d.id = diagnostic_id and (select private.can_manage_ticket(d.ticket_id))))
  with check (exists (select 1 from public.diagnostics d where d.id = diagnostic_id and (select private.can_manage_ticket(d.ticket_id))));

create policy ai_diagnostics_read on public.ai_diagnostics for select to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin())
         or (ticket_id is not null and (select private.is_technician()) and (select private.can_view_ticket(ticket_id))));

create policy checklist_runs_staff_read on public.checklist_runs for select to authenticated using ((select private.can_manage_ticket(ticket_id)));
create policy checklist_runs_staff_insert on public.checklist_runs for insert to authenticated with check ((select private.can_manage_ticket(ticket_id)));
create policy checklist_runs_staff_update on public.checklist_runs for update to authenticated
  using ((select private.can_manage_ticket(ticket_id))) with check ((select private.can_manage_ticket(ticket_id)));
create policy checklist_items_staff_all on public.checklist_items for all to authenticated
  using (exists (select 1 from public.checklist_runs r where r.id = run_id and (select private.can_manage_ticket(r.ticket_id))))
  with check (exists (select 1 from public.checklist_runs r where r.id = run_id and (select private.can_manage_ticket(r.ticket_id))));

create policy deliveries_read on public.deliveries for select to authenticated using ((select private.can_view_ticket(ticket_id)));
create policy deliveries_staff_insert on public.deliveries for insert to authenticated with check ((select private.can_manage_ticket(ticket_id)));

-- ---------------------------------------------------------------- proyectos digitales
create policy projects_read on public.digital_projects for select to authenticated
  using ((deleted_at is null and customer_id = (select private.my_customer_id())) or (select private.is_admin()));
create policy projects_admin_write on public.digital_projects for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy project_history_read on public.project_status_history for select to authenticated
  using (exists (select 1 from public.digital_projects p where p.id = project_id
                 and (p.customer_id = (select private.my_customer_id()) or (select private.is_admin()))));
create policy project_files_read on public.project_files for select to authenticated
  using (deleted_at is null and exists (select 1 from public.digital_projects p where p.id = project_id
         and ((select private.is_admin()) or (p.customer_id = (select private.my_customer_id()) and visibility = 'client'))));
create policy project_files_admin_write on public.project_files for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy project_comments_read on public.project_comments for select to authenticated
  using (exists (select 1 from public.digital_projects p where p.id = project_id
         and ((select private.is_admin()) or (p.customer_id = (select private.my_customer_id()) and visibility = 'client'))));
create policy project_comments_insert on public.project_comments for insert to authenticated
  with check (author_id = (select auth.uid()) and exists (select 1 from public.digital_projects p where p.id = project_id
         and ((select private.is_admin()) or (p.customer_id = (select private.my_customer_id()) and visibility = 'client'))));

-- ---------------------------------------------------------------- cotizaciones
create policy quotes_read on public.quotes for select to authenticated
  using ((select private.is_admin())
         or (ticket_id is not null and (select private.can_view_ticket(ticket_id)) and ((select private.is_staff()) or status <> 'draft'))
         or (customer_id = (select private.my_customer_id()) and status <> 'draft'));
create policy quotes_staff_insert on public.quotes for insert to authenticated
  with check ((select private.is_admin())
              or (ticket_id is not null and (select private.can_manage_ticket(ticket_id)) and (select private.has_permission('quotes.manage'))));
create policy quotes_staff_update on public.quotes for update to authenticated
  using ((select private.can_manage_quote(id))) with check ((select private.can_manage_quote(id)));
create policy quote_items_read on public.quote_items for select to authenticated using ((select private.can_view_quote(quote_id)));
create policy quote_items_staff_write on public.quote_items for all to authenticated
  using ((select private.can_manage_quote(quote_id))) with check ((select private.can_manage_quote(quote_id)));
create policy quote_events_read on public.quote_events for select to authenticated using ((select private.can_view_quote(quote_id)));

-- ---------------------------------------------------------------- tienda, pagos, garantías (lectura; escritura solo servidor)
create policy orders_read on public.orders for select to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin()));
create policy orders_admin_update on public.orders for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy order_items_read on public.order_items for select to authenticated
  using (exists (select 1 from public.orders o where o.id = order_id
                 and (o.customer_id = (select private.my_customer_id()) or (select private.is_admin()))));
create policy payments_read on public.payments for select to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin()));
create policy payment_events_admin_read on public.payment_events for select to authenticated using ((select private.is_admin()));

create policy warranties_read on public.warranties for select to authenticated
  using (customer_id = (select private.my_customer_id()) or (select private.is_admin())
         or (ticket_id is not null and (select private.is_technician()) and (select private.can_view_ticket(ticket_id))));
create policy warranties_admin_update on public.warranties for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------- documentos y legal
create policy documents_read on public.documents for select to authenticated
  using ((select private.is_admin())
         or (ticket_id is not null and (select private.is_technician()) and (select private.can_view_ticket(ticket_id)))
         or (customer_id = (select private.my_customer_id()) and status <> 'draft'));
create policy document_signatures_read on public.document_signatures for select to authenticated using ((select private.can_view_document(document_id)));
create policy legal_public_read on public.legal_documents for select to anon, authenticated using (status = 'published');
create policy legal_admin_all on public.legal_documents for all to authenticated
  using ((select private.has_permission('legal.manage'))) with check ((select private.has_permission('legal.manage')));
create policy legal_acceptances_read on public.legal_acceptances for select to authenticated
  using (profile_id = (select auth.uid()) or (select private.is_admin()));

-- ---------------------------------------------------------------- CRM y agenda
create policy crm_tasks_read on public.crm_tasks for select to authenticated
  using ((select private.is_admin()) or (assigned_to = (select auth.uid()) and (select private.is_technician())));
create policy crm_tasks_admin_write on public.crm_tasks for all to authenticated
  using ((select private.has_permission('crm.manage'))) with check ((select private.has_permission('crm.manage')));
create policy crm_interactions_read on public.crm_interactions for select to authenticated
  using (exists (select 1 from public.crm_tasks k where k.id = task_id
                 and ((select private.is_admin()) or (k.assigned_to = (select auth.uid()) and (select private.is_technician())))));
create policy crm_interactions_insert on public.crm_interactions for insert to authenticated
  with check (actor_id = (select auth.uid()) and exists (select 1 from public.crm_tasks k where k.id = task_id
                 and ((select private.is_admin()) or (k.assigned_to = (select auth.uid()) and (select private.is_technician())))));
create policy calendar_read on public.calendar_events for select to authenticated
  using ((select private.is_admin())
         or (assigned_to = (select auth.uid()) and (select private.is_technician()))
         or (customer_id is not null and customer_id = (select private.my_customer_id())));
create policy calendar_admin_write on public.calendar_events for all to authenticated
  using ((select private.has_permission('crm.manage'))) with check ((select private.has_permission('crm.manage')));
create policy maintenance_read on public.maintenance_plans for select to authenticated
  using ((select private.can_view_customer(customer_id)));
create policy maintenance_admin_update on public.maintenance_plans for update to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

-- ---------------------------------------------------------------- notificaciones y auditoría
create policy notifications_own_read on public.notifications for select to authenticated using (recipient_id = (select auth.uid()));
create policy notifications_own_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid())) with check (recipient_id = (select auth.uid()));
create policy notification_prefs_own_read on public.notification_preferences for select to authenticated using (profile_id = (select auth.uid()));
create policy notification_prefs_own_insert on public.notification_preferences for insert to authenticated with check (profile_id = (select auth.uid()));
create policy notification_prefs_own_update on public.notification_preferences for update to authenticated
  using (profile_id = (select auth.uid())) with check (profile_id = (select auth.uid()));
create policy push_subs_own_read on public.push_subscriptions for select to authenticated using (profile_id = (select auth.uid()));
create policy push_subs_own_insert on public.push_subscriptions for insert to authenticated with check (profile_id = (select auth.uid()));
create policy push_subs_own_delete on public.push_subscriptions for delete to authenticated using (profile_id = (select auth.uid()));

create policy audit_logs_admin_read on public.audit_logs for select to authenticated using ((select private.is_admin()));
