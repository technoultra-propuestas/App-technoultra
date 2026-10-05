import type { Metadata } from "next";
import { Card, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";
import { SETTINGS } from "@/lib/domain/settings";
import { createClient } from "@/lib/supabase/server";
import { SettingForm } from "./setting-form";

export const metadata: Metadata = { title: "Configuración", robots: { index: false } };

export default async function SettingsPage() {
  await requireRole(["superadmin"]);
  const { data } = await (await createClient()).from("app_settings").select("key, value").in("key", SETTINGS.map((s) => s.key));
  const values = new Map((data ?? []).map((r) => [r.key, r.value]));
  const sections = [...new Set(SETTINGS.map((s) => s.section))];
  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <PageTitle title="Configuración" subtitle="Parámetros del negocio que antes estarían en el código. Los cambios quedan en la auditoría." />
      {sections.map((sec) => (
        <Card key={sec} className="flex flex-col gap-5">
          <h2 className="m-0 text-[18px] font-extrabold">{sec}</h2>
          {SETTINGS.filter((s) => s.section === sec).map((s) => {
            const v = values.get(s.key);
            return <SettingForm key={s.key} settingKey={s.key} label={s.label} hint={s.hint} value={v === undefined || v === null ? "" : String(v)} numeric={s.kind === "int"} />;
          })}
        </Card>
      ))}
    </section>
  );
}
