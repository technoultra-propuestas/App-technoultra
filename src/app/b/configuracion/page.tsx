import type { Metadata } from "next";
import { Panel } from "@/components/ui/detail";
import { ListRow } from "@/components/ui/kit";
import type { NavIconName } from "@/components/ui/icons";
import { PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { SETTINGS } from "@/lib/domain/settings";
import { createClient } from "@/lib/supabase/server";
import { SettingForm } from "./setting-form";

export const metadata: Metadata = { title: "Ajustes", robots: { index: false } };

type Area = { title: string; items: { href: string; title: string; detail: string; icon: NavIconName }[] };
const AREAS: Area[] = [
  {
    title: "Cuenta y seguridad",
    items: [
      { href: "/b/seguridad", title: "Mi cuenta y seguridad", detail: "Contraseña y verificación en dos pasos (obligatoria para el equipo)", icon: "shield" },
      { href: "/b/usuarios", title: "Usuarios del equipo", detail: "Técnicos, accesos y restablecer verificación", icon: "users" },
    ],
  },
  {
    title: "Notificaciones",
    items: [{ href: "/avisos", title: "Avisos del panel", detail: "Notificaciones internas y su historial", icon: "bell" }],
  },
  {
    title: "Comercial y Shop",
    items: [
      { href: "/b/comercial", title: "Comercial", detail: "IVA, recargo por urgencia, domicilio de servicios y diagnóstico", icon: "quote" },
      { href: "/b/tienda/shop", title: "Shop", detail: "Banner, textos, envíos de productos, mensaje de WhatsApp y destacados", icon: "store" },
      { href: "/b/cobertura", title: "Cobertura", detail: "Municipios con servicio presencial y sus tarifas", icon: "map" },
    ],
  },
  {
    title: "Legal",
    items: [
      { href: "/b/legal", title: "Centro legal", detail: "Documentos, versiones, vigencia y aceptaciones", icon: "scale" },
      { href: "/b/privacidad", title: "Privacidad", detail: "Solicitudes de datos y supresión", icon: "lock" },
    ],
  },
  {
    title: "Sistema",
    items: [
      { href: "/b/conocimiento", title: "Centro de conocimiento", detail: "Respuestas del asistente y uso de IA", icon: "folder" },
      { href: "/b/tienda/sincronizacion", title: "Sincronización del catálogo", detail: "Fuente, historial y alertas", icon: "box" },
      { href: "/b/reportes", title: "Reportes", detail: "Indicadores del negocio", icon: "chart" },
    ],
  },
];

/** Estado de las integraciones (solo «configurada / pendiente»; jamás se muestra ningún valor ni secreto). */
const INTEGRATIONS: { label: string; detail: string; vars: string[] }[] = [
  { label: "Pagos en línea", detail: "Cobro de servicios y confirmación verificada", vars: ["MERCADOPAGO_ACCESS_TOKEN", "MERCADOPAGO_WEBHOOK_SECRET"] },
  { label: "Correo", detail: "Verificación de cuenta y avisos", vars: ["RESEND_API_KEY"] },
  { label: "Imágenes y evidencias", detail: "Almacenamiento de fotos del equipo", vars: ["CLOUDINARY_CLOUD_NAME", "CLOUDINARY_API_KEY", "CLOUDINARY_API_SECRET"] },
  { label: "Asistente con IA", detail: "Diagnóstico preliminar y respuestas", vars: ["OPENROUTER_API_KEY", "AI_MODEL"] },
  { label: "Monitoreo de errores", detail: "Errores del servidor y del navegador", vars: ["SENTRY_DSN"] },
  { label: "Catálogo de proveedor", detail: "Sincronización automática de productos", vars: ["EXCELENTER_CATALOG_CSV_URL"] },
  { label: "Tareas programadas", detail: "Sincronización, conciliación y avisos", vars: ["CRON_SECRET"] },
];

export default async function SettingsPage() {
  await requireRole(["superadmin"]);
  const { data } = await (await createClient()).from("app_settings").select("key, value").in("key", SETTINGS.map((s) => s.key));
  const values = new Map((data ?? []).map((r) => [r.key, r.value]));
  const sections = [...new Set(SETTINGS.map((s) => s.section))];
  return (
    <section className="mx-auto flex w-full max-w-[920px] flex-col gap-5">
      <PageTitle title="Ajustes" subtitle="Cuenta, seguridad, comercial, Shop, integraciones, legal y sistema. Los cambios quedan en la auditoría." />
      <div className="grid gap-4 lg:grid-cols-2 [&>*]:min-w-0">
        {AREAS.map((a) => (
          <section key={a.title} className="rounded-card border border-line bg-white p-4 shadow-card">
            <h2 className="m-0 mb-1 px-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">{a.title}</h2>
            <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
              {a.items.map((i) => (
                <li key={i.href}>
                  <ListRow href={i.href} title={i.title} detail={i.detail} icon={i.icon} tone="neutral" />
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="rounded-card border border-line bg-white p-4 shadow-card">
          <h2 className="m-0 mb-1 px-2 text-[13px] font-extrabold uppercase tracking-[0.06em] text-muted">Integraciones</h2>
          <ul className="m-0 flex list-none flex-col divide-y divide-line p-0">
            {INTEGRATIONS.map((i) => {
              const ok = i.vars.every((v) => Boolean(process.env[v]));
              return (
                <li key={i.label} className="flex min-h-14 items-center justify-between gap-3 px-2 py-2.5">
                  <span className="min-w-0">
                    <span className="block text-[14.5px] font-extrabold">{i.label}</span>
                    <span className="block truncate text-[12.5px] font-semibold text-muted">{i.detail}</span>
                  </span>
                  <span className={`flex-none rounded-full px-3 py-1 text-[12px] font-extrabold ${ok ? "bg-ok-soft text-ok" : "bg-warn-soft text-warn"}`}>{ok ? "Configurada" : "Pendiente"}</span>
                </li>
              );
            })}
          </ul>
        </section>
      </div>
      <h2 className="m-0 mt-2 text-[20px] font-extrabold">Datos del negocio</h2>
      {sections.map((sec) => (
        <Panel key={sec} title={sec}>
          <div className="flex flex-col gap-5">
            {SETTINGS.filter((s) => s.section === sec).map((s) => {
              const v = values.get(s.key);
              return <SettingForm key={s.key} settingKey={s.key} label={s.label} hint={s.hint} value={v === undefined || v === null ? "" : String(v)} numeric={s.kind === "int"} />;
            })}
          </div>
        </Panel>
      ))}
    </section>
  );
}
