-- FASE 10 · 13 · Almacenamiento privado de documentos y firmas, y numeración de documentos.

-- Bucket privado: sin políticas para anon/authenticated ⇒ solo service_role (servidor) puede leer/escribir.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
    values ('documents', 'documents', false, 10485760, array['application/pdf', 'image/png'])
    on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
  end if;
end $$;

-- El código del documento se necesita ANTES de generar el PDF (va impreso en el documento).
create function public.next_document_code() returns text
language sql security definer set search_path = '' as $$ select private.next_code('DOC') $$;
revoke execute on function public.next_document_code() from public, anon, authenticated;
grant execute on function public.next_document_code() to service_role;

-- Marca "visto" sin permitir otros cambios (idempotente). Solo el dueño del documento.
create function public.mark_document_viewed(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.documents d set status = 'viewed', viewed_at = coalesce(d.viewed_at, now())
  where d.id = p_doc and d.status in ('generated', 'sent') and d.customer_id = private.my_customer_id();
end $$;
revoke execute on function public.mark_document_viewed(uuid) from public, anon;
grant execute on function public.mark_document_viewed(uuid) to authenticated, service_role;

-- Rechazo explícito del cliente (queda registrado; el documento no se modifica).
create function public.reject_document(p_doc uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.documents d set status = 'rejected', rejected_at = now()
  where d.id = p_doc and d.status in ('generated', 'sent', 'viewed') and d.customer_id = private.my_customer_id();
  if not found then raise exception 'document_not_rejectable' using errcode = 'P0002'; end if;
  perform private.write_audit(auth.uid(), 'client', 'document.rejected', 'documents', p_doc::text, '{}'::jsonb);
end $$;
revoke execute on function public.reject_document(uuid) from public, anon;
grant execute on function public.reject_document(uuid) to authenticated, service_role;
