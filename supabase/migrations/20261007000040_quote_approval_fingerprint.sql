-- La aprobación de una cotización deja constancia del DOCUMENTO exacto que el cliente revisó: código, versión y huella SHA-256 del PDF vigente.
-- Es la misma función de la migración 22; solo agrega esa huella al evento y a la auditoría (no cambia reglas, permisos ni estados).
create or replace function public.decide_quote(p_quote uuid, p_decision text, p_message text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  q public.quotes%rowtype; v_msg text := nullif(btrim(p_message), '');
  d_code text; d_version int; d_sha text; v_note text;
begin
  if auth.uid() is null or private.my_role() is distinct from 'client' then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into q from public.quotes where id = p_quote and customer_id = private.my_customer_id() for update;
  if not found then raise exception 'quote_not_found' using errcode = 'P0002'; end if;
  if q.status not in ('sent', 'clarification') then raise exception 'quote_not_open' using errcode = 'P0001'; end if;
  if q.valid_until is not null and q.valid_until < (now() at time zone 'America/Bogota')::date then
    raise exception 'quote_expired' using errcode = 'P0001';
  end if;

  if p_decision = 'approve' then
    -- documento vigente (no reemplazado) de ESTA cotización
    select dc.code, dc.version, dc.sha256 into d_code, d_version, d_sha
      from public.documents dc where dc.quote_id = q.id and dc.doc_type = 'quote' and dc.status <> 'superseded'
      order by dc.version desc limit 1;
    v_note := case when d_sha is null then v_msg
                   else concat_ws(' · ', v_msg, 'Aprobada sobre el documento ' || d_code || ' v' || d_version || ' (SHA-256 ' || d_sha || ')') end;
    perform private.consume_diagnosis_credit(q.id);
    update public.quotes set status = 'approved', decided_at = now(), decided_by = auth.uid() where id = q.id;
    perform private.quote_event(q.id, 'approved', 'client', v_note);
    perform private.write_audit(auth.uid(), 'client', 'quote.approved', 'quotes', q.id::text,
      jsonb_build_object('total', q.total, 'document', d_code, 'document_version', d_version, 'document_sha256', d_sha));
    if q.ticket_id is not null then
      perform private.apply_transition(q.ticket_id, case when q.needs_part then 'awaiting_part' else 'in_service' end::public.ticket_status,
        auth.uid(), 'client', 'Cotización aprobada por el cliente', true);
      perform private.notify_ticket_staff(q.ticket_id, 'quote.approved', 'El cliente aprobó la cotización ' || q.code);
    end if;
  elsif p_decision = 'reject' then
    update public.quotes set status = 'rejected', decided_at = now(), decided_by = auth.uid() where id = q.id;
    perform private.quote_event(q.id, 'rejected', 'client', v_msg);
    perform private.write_audit(auth.uid(), 'client', 'quote.rejected', 'quotes', q.id::text, '{}'::jsonb);
    if q.ticket_id is not null then
      perform private.apply_transition(q.ticket_id, 'cancelled', auth.uid(), 'client',
        'Cotización rechazada por el cliente' || coalesce(': ' || v_msg, ''), true);
      perform private.notify_ticket_staff(q.ticket_id, 'quote.rejected', 'El cliente rechazó la cotización ' || q.code);
    end if;
  elsif p_decision = 'question' then
    if v_msg is null then raise exception 'message_required' using errcode = '22023'; end if;
    update public.quotes set status = 'clarification' where id = q.id;
    perform private.quote_event(q.id, 'question', 'client', v_msg);
    if q.ticket_id is not null then perform private.notify_ticket_staff(q.ticket_id, 'quote.question', 'El cliente tiene una pregunta sobre ' || q.code); end if;
  else
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
end $$;
revoke execute on function public.decide_quote(uuid, text, text) from public, anon;
grant execute on function public.decide_quote(uuid, text, text) to authenticated;
