-- ASISTENTE TECHNOULTRA · 32 · Base de conocimiento (FAQ) versionada y métricas de uso de IA.
--  · La base de conocimiento NO duplica datos dinámicos: las respuestas usan plantillas ({price}, {name}, {cities}…) que se rellenan
--    en el servidor desde `services`, `coverage_areas` y `app_settings` (source_type/source_id).
--  · Solo el contenido PUBLICADO se usa para responder. Solo el SUPERADMIN (con MFA) escribe.
--  · `ai_usage` registra cuándo se usó IA y cuánto costó, SIN almacenar el contenido de las conversaciones.

create table public.knowledge_entries (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('servicios', 'precios', 'cobertura', 'pagos', 'tickets', 'cotizaciones', 'documentos', 'garantia', 'mantenimiento', 'tienda', 'ayuda', 'general')),
  title text not null check (char_length(title) between 3 and 140),
  question text not null check (char_length(question) between 3 and 300),
  answer text not null check (char_length(answer) between 3 and 2000),
  keywords text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  priority int not null default 0 check (priority between -100 and 100),
  locale text not null default 'es-CO',
  source_type text check (source_type in ('service', 'coverage', 'setting', 'status')),
  source_id text check (source_id is null or char_length(source_id) <= 120),
  uses_ai boolean not null default false,
  version int not null default 1,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index knowledge_entries_published_idx on public.knowledge_entries (category, priority desc) where status = 'published';
create trigger knowledge_entries_updated before update on public.knowledge_entries for each row execute function private.set_updated_at();

-- Historial inmutable de versiones (quién, cuándo y qué cambió).
create table public.knowledge_entry_versions (
  id bigint generated always as identity primary key,
  entry_id uuid not null references public.knowledge_entries (id) on delete cascade,
  version int not null,
  snapshot jsonb not null,
  changed_by uuid,
  changed_at timestamptz not null default now(),
  unique (entry_id, version)
);
create function private.knowledge_version() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'UPDATE' then
    if (new.category, new.title, new.question, new.answer, new.keywords, new.status, new.priority, new.source_type, new.source_id, new.uses_ai)
       is distinct from (old.category, old.title, old.question, old.answer, old.keywords, old.status, old.priority, old.source_type, old.source_id, old.uses_ai) then
      new.version := old.version + 1;
    end if;
  end if;
  return new;
end $$;
create trigger knowledge_entries_version before update on public.knowledge_entries for each row execute function private.knowledge_version();
create function private.knowledge_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.knowledge_entry_versions (entry_id, version, snapshot, changed_by)
  values (new.id, new.version, to_jsonb(new) - 'created_by', auth.uid()) on conflict (entry_id, version) do nothing;
  return new;
end $$;
create trigger knowledge_entries_snapshot after insert or update on public.knowledge_entries for each row execute function private.knowledge_snapshot();
create function private.knowledge_versions_immutable() returns trigger language plpgsql as $$
begin raise exception 'knowledge_versions_immutable' using errcode = '42501'; end $$;
create trigger knowledge_versions_no_change before update or delete on public.knowledge_entry_versions for each row execute function private.knowledge_versions_immutable();

alter table public.knowledge_entries enable row level security;
alter table public.knowledge_entry_versions enable row level security;
-- Lectura: contenido publicado para cualquier sesión autenticada (el asistente corre con la sesión de la persona); todo para el SUPERADMIN.
create policy knowledge_read_published on public.knowledge_entries for select to authenticated using (status = 'published' or private.is_superadmin());
create policy knowledge_superadmin_write on public.knowledge_entries for insert to authenticated with check (private.is_superadmin());
create policy knowledge_superadmin_update on public.knowledge_entries for update to authenticated using (private.is_superadmin()) with check (private.is_superadmin());
create policy knowledge_versions_read on public.knowledge_entry_versions for select to authenticated using (private.is_superadmin());
revoke all on public.knowledge_entries, public.knowledge_entry_versions from anon, authenticated;
grant select on public.knowledge_entries to authenticated;
grant insert (category, title, question, answer, keywords, status, priority, locale, source_type, source_id, uses_ai, created_by) on public.knowledge_entries to authenticated;
grant update (category, title, question, answer, keywords, status, priority, source_type, source_id, uses_ai) on public.knowledge_entries to authenticated;
grant select on public.knowledge_entry_versions to authenticated;
grant all on public.knowledge_entries, public.knowledge_entry_versions to service_role;

-- ---------------------------------------------------------------- métricas de IA (sin contenido de conversaciones)
create table public.ai_usage (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  profile_id uuid references public.profiles (id) on delete set null,
  route text not null check (route in ('deterministic', 'database', 'faq', 'ai', 'fallback')),
  topic text check (topic is null or char_length(topic) <= 40),
  provider text,
  model text,
  tokens_input int,
  tokens_output int,
  latency_ms int,
  error text check (error is null or char_length(error) <= 60)
);
create index ai_usage_at_idx on public.ai_usage (at desc);
alter table public.ai_usage enable row level security;
create policy ai_usage_superadmin_read on public.ai_usage for select to authenticated using (private.is_superadmin());
revoke all on public.ai_usage from anon, authenticated;
grant select on public.ai_usage to authenticated;
grant all on public.ai_usage to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------------------------------------------------------------- contenido inicial (reglas reales del producto; los valores salen de la base de datos)
insert into public.knowledge_entries (category, title, question, answer, keywords, status, priority, source_type, source_id, uses_ai) values
 ('precios', 'Valor del diagnóstico básico', '¿Cuánto cuesta el diagnóstico?', 'El {service_name} tiene un valor de {price}. {includes}', '{diagnostico,diagnostico basico,cuanto cuesta,precio,valor,costo}', 'published', 50, 'service', 'diagnostico-basico', false),
 ('servicios', 'Qué incluye el diagnóstico básico', '¿Qué incluye el diagnóstico?', 'El {service_name} permite identificar las posibles causas del problema con una revisión técnica. {includes} {excludes}', '{que incluye,incluye,diagnostico,revision,alcance}', 'published', 40, 'service', 'diagnostico-basico', false),
 ('pagos', 'El diagnóstico se abona a la reparación', '¿El diagnóstico se descuenta de la reparación?', 'Sí. Si apruebas la reparación, el valor del diagnóstico ya pagado se abona a su costo (una sola vez). Si decides no repararlo, el diagnóstico queda cobrado.', '{abono,descuenta,diagnostico pagado,reparacion,credito}', 'published', 45, null, null, false),
 ('cobertura', 'Ciudades con servicio presencial', '¿Atienden en mi ciudad?', 'Tenemos servicio presencial (domicilio, recogida y entrega) en: {cities}. En otras ciudades puedes solicitar asistencia remota si el servicio lo permite.', '{cobertura,atienden,ciudad,domicilio,palmira,cali,jamundi,yumbo,donde}', 'published', 50, 'coverage', null, false),
 ('cobertura', 'Tarifa de domicilio', '¿Cuánto cuesta el domicilio?', 'La tarifa de domicilio depende de tu ciudad y se calcula al confirmar el servicio: {home_fees}.', '{domicilio,tarifa,envio,recogida,cuanto cuesta el domicilio}', 'published', 40, 'coverage', null, false),
 ('pagos', 'Cómo pagar', '¿Cómo puedo pagar?', 'Puedes pagar en línea con Mercado Pago (tarjetas, PSE y otros medios) desde tu ticket, o pagar en el local y el equipo registrará el pago. Un pago solo se confirma cuando Mercado Pago lo verifica.', '{pagar,pago,mercado pago,tarjeta,pse,efectivo,transferencia,como pago}', 'published', 45, null, null, false),
 ('pagos', 'Pago pendiente', '¿Qué significa que mi pago esté pendiente?', 'Estamos esperando la confirmación de Mercado Pago. Normalmente tarda unos segundos o minutos; te avisaremos aquí apenas se acredite. No necesitas pagar de nuevo.', '{pago pendiente,pendiente,confirmando,no aparece mi pago}', 'published', 40, null, null, false),
 ('tickets', 'Cómo solicito un servicio', '¿Cómo solicito un servicio?', 'Entra a «Servicios», elige el que necesitas, cuéntanos qué pasa y confirma. Se crea tu ticket automáticamente y te mostramos el siguiente paso. Si no sabes cuál elegir, pregúntale al asistente.', '{solicitar,servicio,como solicito,pedir,agendar,reparar}', 'published', 45, null, null, false),
 ('cotizaciones', 'Cuándo recibo una cotización', '¿Por qué debo esperar una cotización?', 'Algunos servicios no tienen un precio final hasta revisar el equipo (por ejemplo, si hace falta un repuesto). Te enviaremos una cotización para que la apruebes; no pagas nada antes de aprobarla.', '{cotizacion,presupuesto,precio final,aprobar,repuesto}', 'published', 40, null, null, false),
 ('garantia', 'Garantía', '¿Tienen garantía los servicios?', 'La garantía depende del servicio o producto y queda indicada en tu cotización y en el documento de garantía que recibes al entregar el equipo.', '{garantia,garantia del servicio,cubre}', 'published', 35, null, null, false),
 ('mantenimiento', 'Mantenimiento preventivo', '¿Cada cuánto debo hacer mantenimiento?', 'Te recomendamos un mantenimiento preventivo periódico; al entregar tu equipo te indicamos la fecha sugerida y te avisamos cuando se acerque.', '{mantenimiento,preventivo,cada cuanto,periodico,limpieza}', 'published', 30, 'setting', 'maintenance.default_months', false),
 ('ayuda', 'Contacto', '¿Cómo me comunico con TechnoUltra?', 'Puedes escribirnos o llamarnos al {phone}. También puedes seguir tu solicitud desde tu ticket.', '{contacto,telefono,llamar,celular,hablar,whatsapp}', 'published', 35, 'setting', 'business.phone', false),
 ('ayuda', 'No sé qué servicio necesito', '¿Qué servicio necesito?', 'Cuéntame qué le pasa a tu equipo y te sugiero las opciones que mejor encajan. Si no estás seguro, el diagnóstico básico es un buen punto de partida.', '{que servicio necesito,no se,recomiendas,ayudame,orientame}', 'published', 20, null, null, true);
-- Estados del ticket (explicación de cada etapa)
insert into public.knowledge_entries (category, title, question, answer, keywords, status, priority, source_type, source_id, uses_ai) values
 ('tickets', 'Estado: Recibido', '¿Qué significa «Recibido»?', 'Tu solicitud quedó registrada y el equipo la va a gestionar. Aún no se ha iniciado la revisión técnica.', '{recibido,estado recibido}', 'published', 30, 'status', 'received', false),
 ('tickets', 'Estado: En diagnóstico', '¿Qué significa «En diagnóstico»?', 'Un técnico está revisando tu equipo para identificar la causa del problema y definir qué hace falta.', '{en diagnostico,diagnosticando,estado diagnostico}', 'published', 30, 'status', 'diagnosing', false),
 ('tickets', 'Estado: Esperando aprobación', '¿Qué significa «Esperando aprobación»?', 'Te enviamos una cotización y esperamos tu decisión. No hacemos ningún trabajo hasta que la apruebes.', '{esperando aprobacion,aprobacion,por aprobar}', 'published', 30, 'status', 'awaiting_approval', false),
 ('tickets', 'Estado: Esperando repuesto', '¿Qué significa «Esperando repuesto»?', 'Aprobaste la reparación y estamos esperando la llegada del repuesto necesario. Te avisaremos cuando llegue.', '{esperando repuesto,repuesto,pieza}', 'published', 30, 'status', 'awaiting_part', false),
 ('tickets', 'Estado: En servicio', '¿Qué significa «En servicio»?', 'Estamos realizando el trabajo aprobado en tu equipo.', '{en servicio,reparando,trabajando}', 'published', 30, 'status', 'in_service', false),
 ('tickets', 'Estado: En pruebas', '¿Qué significa «En pruebas»?', 'El trabajo terminó y estamos verificando que todo funcione correctamente antes de entregártelo.', '{en pruebas,probando,verificando}', 'published', 30, 'status', 'testing', false),
 ('tickets', 'Estado: Listo para entregar', '¿Qué significa «Listo para entregar»?', 'Tu equipo está listo. Coordinaremos contigo la entrega o puedes pasar a recogerlo.', '{listo para entregar,listo,recoger,entrega}', 'published', 30, 'status', 'ready', false),
 ('tickets', 'Estado: Entregado', '¿Qué significa «Entregado»?', 'El equipo ya fue entregado. En tu ticket encuentras el acta de entrega y la garantía.', '{entregado,finalizado,terminado}', 'published', 30, 'status', 'delivered', false),
 ('tickets', 'Estado: Cancelado', '¿Qué significa «Cancelado»?', 'El servicio se canceló y no continuará. Si ya habías pagado algo, el equipo te explicará cómo se resuelve.', '{cancelado,cancelar,anulado}', 'published', 30, 'status', 'cancelled', false);
