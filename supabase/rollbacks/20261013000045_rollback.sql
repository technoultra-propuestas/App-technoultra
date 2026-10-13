-- REVERSIÓN de la migración 20261013000045 (solo para emergencias; no es una migración y el CLI no la ejecuta).
-- Restaura private.on_document_signed() a su definición EXACTA de la migración 44 y retira el trigger/función de auditoría detallada de firmas.
-- No toca datos: los avisos y registros de auditoría creados mientras estuvo aplicada se conservan. Después: delete from supabase_migrations.schema_migrations where version = '20261013000045';
begin;
drop trigger if exists document_signatures_audit_detail on public.document_signatures;
drop function if exists private.audit_document_signature();
create or replace function private.on_document_signed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t public.tickets%rowtype; v_cust uuid; v_name text;
begin
  if new.ticket_id is null or new.doc_type not in ('reception', 'delivery') then return null; end if;
  select * into t from public.tickets where id = new.ticket_id;
  if not found then return null; end if;
  select profile_id into v_cust from public.customers where id = new.customer_id;
  v_name := case new.doc_type when 'reception' then 'acta de recepción' else 'acta de entrega' end;
  perform private.notify('doc-signed:' || new.id, v_cust, 'document.signed', 'Documento firmado', 'Guardamos tu firma en el ' || v_name || '. Puedes consultarlo cuando quieras.', 'document', new.id, 'normal', null);
  perform private.notify('doc-signed:' || new.id, t.assigned_to, 'document.signed_staff', 'Firmada: ' || v_name || ' ' || t.code,
    case new.doc_type when 'reception' then 'El cliente firmó el acta. Ya puedes diagnosticar el equipo.' else 'El cliente firmó el acta de entrega.' end, 'ticket', t.id, 'high', null);
  -- Con el acta firmada (y fotos + acta de recepción completos) el ticket pasa solo a diagnóstico: transición del sistema con sus precondiciones.
  if new.doc_type = 'reception' and t.status = 'received' then
    begin
      perform private.apply_transition(t.id, 'diagnosing', null, 'system', 'Acta de recepción firmada por el cliente', true);
    exception when others then
      -- una precondición pendiente (p. ej. fotos) no debe impedir registrar la firma: el técnico verá qué falta
      null;
    end;
  end if;
  return null;
end $$;
commit;
