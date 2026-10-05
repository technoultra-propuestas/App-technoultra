-- FASE 7 · 12 · Checklist de pruebas (se copia de la plantilla configurable) y finalización de la ejecución.

-- Inicia (o devuelve) la ejecución de checklist del ticket con los ítems activos de la plantilla.
create function public.start_checklist(p_ticket uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_run uuid;
begin
  if not private.can_manage_ticket(p_ticket) then raise exception 'forbidden' using errcode = '42501'; end if;
  if (select status from public.tickets where id = p_ticket) not in ('in_service', 'testing', 'awaiting_part') then
    raise exception 'ticket_not_in_testing_phase' using errcode = 'P0001';
  end if;
  select id into v_run from public.checklist_runs where ticket_id = p_ticket and completed_at is null order by created_at desc limit 1;
  if v_run is not null then return v_run; end if;
  insert into public.checklist_runs (ticket_id, started_by) values (p_ticket, auth.uid()) returning id into v_run;
  insert into public.checklist_items (run_id, label, is_required)
  select v_run, label, is_required from public.checklist_template_items where is_active order by sort_order;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'checklist.started', 'tickets', p_ticket::text, '{}'::jsonb);
  return v_run;
end $$;

-- Marca la ejecución como completada solo si no quedan pruebas obligatorias pendientes o fallidas.
create function public.complete_checklist(p_run uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ticket uuid;
begin
  select ticket_id into v_ticket from public.checklist_runs where id = p_run;
  if v_ticket is null or not private.can_manage_ticket(v_ticket) then raise exception 'forbidden' using errcode = '42501'; end if;
  if exists (select 1 from public.checklist_items where run_id = p_run and is_required and state in ('pending', 'fail')) then
    raise exception 'checklist_incomplete' using errcode = 'P0001';
  end if;
  update public.checklist_runs set completed_at = now() where id = p_run and completed_at is null;
end $$;

revoke execute on function public.start_checklist(uuid), public.complete_checklist(uuid) from public, anon;
grant execute on function public.start_checklist(uuid), public.complete_checklist(uuid) to authenticated, service_role;

-- Validación humana del diagnóstico asistido por IA: queda como "preliminar" hasta que el personal lo revise.
create function public.review_ai_diagnostic(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_ticket uuid;
begin
  if p_status not in ('validated', 'edited', 'rejected') then raise exception 'invalid_status' using errcode = '22023'; end if;
  select ticket_id into v_ticket from public.ai_diagnostics where id = p_id;
  if v_ticket is null or not private.can_manage_ticket(v_ticket) then raise exception 'forbidden' using errcode = '42501'; end if;
  update public.ai_diagnostics set validation_status = p_status, validated_by = auth.uid(), validated_at = now() where id = p_id;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'ai_diagnostic.reviewed', 'ai_diagnostics', p_id::text, jsonb_build_object('status', p_status));
end $$;
revoke execute on function public.review_ai_diagnostic(uuid, text) from public, anon;
grant execute on function public.review_ai_diagnostic(uuid, text) to authenticated, service_role;
