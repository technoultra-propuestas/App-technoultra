-- FASE 10 · 16 · Publicación de versiones legales (solo con permiso legal.manage). La versión publicada anterior pasa a "retired"
-- (el histórico de aceptaciones no se toca) y la nueva calcula su hash en base de datos.

create function public.publish_legal_document(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.legal_documents%rowtype;
begin
  if not private.has_permission('legal.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.legal_documents where id = p_id for update;
  if not found or d.status <> 'draft' then raise exception 'document_not_draft' using errcode = 'P0001'; end if;
  update public.legal_documents set status = 'retired' where slug = d.slug and status = 'published';
  update public.legal_documents set status = 'published' where id = d.id;
  perform private.write_audit(auth.uid(), 'admin', 'legal.published', 'legal_documents', d.id::text, jsonb_build_object('slug', d.slug, 'version', d.version));
end $$;
revoke execute on function public.publish_legal_document(uuid) from public, anon;
grant execute on function public.publish_legal_document(uuid) to authenticated, service_role;

-- Versión siguiente de un documento legal (evita colisiones al crear borradores).
create function public.next_legal_version(p_slug text) returns int
language sql stable security definer set search_path = '' as $$
  select case when private.has_permission('legal.manage') then coalesce(max(version), 0) + 1 else null end
  from public.legal_documents where slug = p_slug
$$;
revoke execute on function public.next_legal_version(text) from public, anon;
grant execute on function public.next_legal_version(text) to authenticated, service_role;

-- Borradores: editables solo por quien gestiona lo legal (los publicados son inmutables por trigger).
grant delete on public.legal_documents to authenticated;
create policy legal_draft_delete on public.legal_documents for delete to authenticated
  using (status = 'draft' and (select private.has_permission('legal.manage')));
