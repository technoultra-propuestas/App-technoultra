-- FIRMA DEL ACTA → aviso REAL (con push) al SUPERADMIN y auditoría de la firma. Aditiva: reemplaza una función por su versión anterior (migración 44)
-- con UN cambio, y agrega un trigger de auditoría. No toca datos existentes.
--
-- Antes (44): al firmarse el acta el técnico recibía un aviso de prioridad alta, pero el SUPERADMIN solo recibía la copia de supervisión (prioridad baja:
-- sin correo ni push). Ahora el SUPERADMIN recibe SU aviso (el aviso propio reemplaza a la copia de supervisión del mismo evento: no hay duplicado).

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
  -- NUEVO: el SUPERADMIN (quien coordina la operación) recibe el mismo aviso con la misma prioridad (con push), idempotente por evento.
  perform private.notify_superadmins('doc-signed:' || new.id, 'document.signed_staff', 'Firmada: ' || v_name || ' ' || t.code,
    case new.doc_type when 'reception' then 'El cliente firmó el acta de recepción.' else 'El cliente firmó el acta de entrega.' end, 'ticket', t.id, 'high', null);
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

-- Auditoría de la firma (cadena de auditoría existente): quién (el cliente, o quien prestó el dispositivo en una firma presencial), cuándo, qué versión y su huella.
create function private.audit_document_signature() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := coalesce(new.captured_by, new.signer_profile_id); v_role text; d public.documents%rowtype;
begin
  select * into d from public.documents where id = new.document_id;
  select role::text into v_role from public.profiles where id = v_actor;
  perform private.write_audit(v_actor, coalesce(v_role, 'client'), 'document.signed', 'documents', new.document_id::text,
    jsonb_build_object('code', d.code, 'version', d.version, 'type', d.doc_type, 'ticket', d.ticket_id, 'channel', new.capture_channel, 'sha256', new.document_sha256));
  return null;
end $$;
create trigger document_signatures_audit_detail after insert on public.document_signatures for each row execute function private.audit_document_signature();
revoke execute on function private.audit_document_signature() from public, anon, authenticated;
