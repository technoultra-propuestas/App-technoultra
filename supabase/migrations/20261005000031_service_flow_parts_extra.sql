-- FLUJO · 31 · Un servicio «+ repuesto» no tiene precio final: nunca es de pago inmediato (el repuesto se cotiza antes de cobrar).
create or replace function public.service_flow(p_service uuid, p_modality public.service_modality) returns text
language sql stable security definer set search_path = '' as $$
  select case
    when s.kind <> 'technical' then 'quote'
    when p_modality not in ('store', 'remote') then 'quote'
    when s.base_price is null or s.base_price <= 0 then 'quote'
    when s.flow_override = 'quote' then 'quote'
    when s.flow_override = 'immediate' then 'immediate'
    when s.parts_extra then 'quote'
    when s.price_mode = 'fixed' and not s.requires_quote and not s.requires_diagnosis then 'immediate'
    else 'quote'
  end
  from public.services s where s.id = p_service and s.is_active and s.deleted_at is null
$$;
