-- Cotización con conceptos claros (mano de obra / repuestos / productos / otros) y diagnóstico técnico «finalizado».
-- El concepto es solo de presentación y de la propuesta automática: el precio y los totales siguen saliendo del catálogo y de los
-- triggers existentes (quote_item_before / recalc_quote). Nada de esto otorga permisos nuevos.
alter table public.quote_items
  add column if not exists concept text check (concept is null or concept in ('labor', 'part', 'product', 'other')),
  add column if not exists priority text check (priority is null or priority in ('required', 'recommended', 'optional')),
  add column if not exists suggested_by_system boolean not null default false;

update public.quote_items set concept = case kind when 'service' then 'labor' when 'product' then 'product' else 'other' end where concept is null;

-- Un diagnóstico emitido (finalizado) no se sobrescribe en silencio: queda marcado; cambios posteriores generan una versión nueva del documento.
alter table public.diagnostics
  add column if not exists finalized_at timestamptz,
  add column if not exists finalized_by uuid;

grant insert (concept, priority, suggested_by_system) on public.quote_items to authenticated;
grant update (concept, priority) on public.quote_items to authenticated;

-- Finalizar el diagnóstico: lo hace el técnico que gestiona el ticket (o el SUPERADMIN). Lo hace visible para el cliente y deja constancia.
create or replace function public.finalize_diagnosis(p_ticket uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare d public.diagnostics%rowtype;
begin
  if auth.uid() is null or not (select private.is_staff()) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not (select private.can_view_ticket(p_ticket)) then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.diagnostics where ticket_id = p_ticket order by version desc limit 1 for update;
  if not found then raise exception 'diagnosis_missing' using errcode = 'P0001'; end if;
  update public.diagnostics set visible_to_customer = true, finalized_at = now(), finalized_by = auth.uid() where id = d.id;
  perform private.write_audit(auth.uid(), private.my_role()::text, 'diagnosis.finalized', 'diagnostics', d.id::text, jsonb_build_object('ticket', p_ticket, 'version', d.version));
  return d.id;
end $$;
revoke execute on function public.finalize_diagnosis(uuid) from public, anon;
grant execute on function public.finalize_diagnosis(uuid) to authenticated;
