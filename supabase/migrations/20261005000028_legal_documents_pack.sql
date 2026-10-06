-- LEGAL · 28 · Paquete jurídico completo: dos documentos nuevos (autorización de datos y consentimiento de diagnóstico con IA) y una
-- salvaguarda: un borrador con campos «[PENDIENTE: …]» NO se puede publicar (evita publicar textos jurídicos incompletos).

do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.legal_documents'::regclass and contype = 'c' and pg_get_constraintdef(oid) like '%slug%' and pg_get_constraintdef(oid) like '%terms%';
  if c is not null then execute format('alter table public.legal_documents drop constraint %I', c); end if;
end $$;
alter table public.legal_documents add constraint legal_documents_slug_check check (slug in
  ('terms', 'privacy', 'data_policy', 'warranty_policy', 'service_terms', 'purchase_terms', 'returns_policy', 'consents', 'data_authorization', 'ai_consent'));

create or replace function public.publish_legal_document(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare d public.legal_documents%rowtype;
begin
  if not private.has_permission('legal.manage') then raise exception 'forbidden' using errcode = '42501'; end if;
  select * into d from public.legal_documents where id = p_id for update;
  if not found or d.status <> 'draft' then raise exception 'document_not_draft' using errcode = 'P0001'; end if;
  if d.content like '%[PENDIENTE%' then raise exception 'legal_placeholders_pending' using errcode = 'P0001'; end if;
  update public.legal_documents set status = 'retired' where slug = d.slug and status = 'published';
  update public.legal_documents set status = 'published' where id = d.id;
  perform private.write_audit(auth.uid(), 'superadmin', 'legal.published', 'legal_documents', d.id::text, jsonb_build_object('slug', d.slug, 'version', d.version));
end $$;
