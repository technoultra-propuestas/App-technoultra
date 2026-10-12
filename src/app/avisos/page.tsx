import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClientShell } from "@/components/ui/ClientShell";
import { EmptyState, fmtDateTime } from "@/components/ui/layout";
import { StaffShell } from "@/components/ui/StaffShell";
import { getProfile } from "@/lib/auth/session";
import { serverEnv } from "@/lib/env.server";
import { createClient } from "@/lib/supabase/server";
import { markAllReadAction, openNotificationAction } from "./actions";
import { PrefsForm } from "./prefs-form";
import { PushCard } from "./push-card";
import { SoundToggle } from "./sound-toggle";
import Link from "next/link";

export const metadata: Metadata = { title: "Avisos", robots: { index: false } };

export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ f?: string }> }) {
  const profile = await getProfile();
  if (!profile || !profile.is_active) redirect("/login");
  const staff = profile.role !== "client";
  const home = staff ? "/b" : "/c";
  const supabase = await createClient();
  const filter = (await searchParams).f;
  const onlyUnread = filter === "sin-leer";
  const onlySupervision = filter === "supervision" && profile.role === "superadmin";
  const [{ data }, { data: prefs }] = await Promise.all([
    supabase.from("notifications").select("id, title, body, created_at, read_at, priority, type").eq("channel", "in_app").order("created_at", { ascending: false }).limit(100),
    supabase.from("notification_preferences").select("email_enabled").eq("profile_id", profile.id).maybeSingle(),
  ]);
  const all = data ?? [];
  const unread = all.filter((n) => !n.read_at).length;
  const supervision = all.filter((n) => n.type === "supervision");
  const list = onlySupervision ? supervision : onlyUnread ? all.filter((n) => !n.read_at) : all;
  const publicKey = serverEnv.push()?.VAPID_PUBLIC_KEY ?? null;

  const content = (
    <section className="flex max-w-[760px] flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="m-0 text-[30px] font-extrabold tracking-[-0.025em]">Avisos</h1>
        {unread > 0 ? (
          <form action={markAllReadAction}>
            <button type="submit" className="press min-h-11 text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px]">
              Marcar todas leídas
            </button>
          </form>
        ) : null}
      </div>
      <nav aria-label="Filtrar avisos" className="flex gap-2 text-[14px] font-extrabold">
        <Link href="/avisos" aria-current={!onlyUnread && !onlySupervision ? "page" : undefined} className={`flex min-h-11 items-center rounded-full px-4 no-underline ${!onlyUnread && !onlySupervision ? "bg-ink text-white" : "border border-line-strong text-ink"}`}>Todos</Link>
        <Link href="/avisos?f=sin-leer" aria-current={onlyUnread ? "page" : undefined} className={`flex min-h-11 items-center rounded-full px-4 no-underline ${onlyUnread ? "bg-ink text-white" : "border border-line-strong text-ink"}`}>Sin leer{unread > 0 ? ` (${unread})` : ""}</Link>
        {profile.role === "superadmin" ? <Link href="/avisos?f=supervision" aria-current={onlySupervision ? "page" : undefined} className={`flex min-h-11 items-center rounded-full px-4 no-underline ${onlySupervision ? "bg-ink text-white" : "border border-line-strong text-ink"}`}>Supervisión{supervision.length > 0 ? ` (${supervision.length})` : ""}</Link> : null}
      </nav>
      {list.length === 0 ? (
        <EmptyState title={onlyUnread ? "No tienes avisos sin leer" : "No tienes avisos"} text="Te avisaremos aquí cuando tu servicio avance o tengas algo por revisar." />
      ) : (
        <ul className="m-0 flex list-none flex-col overflow-hidden rounded-card border border-line bg-white p-0 shadow-card">
          {list.map((n) => (
            <li key={n.id} className="border-b border-line last:border-0">
              <form action={openNotificationAction}>
                <input type="hidden" name="id" value={n.id} />
                <button type="submit" className="press flex min-h-[72px] w-full items-start gap-3 px-5 py-3.5 text-left hover:bg-paper">
                  <span aria-hidden className={`mt-2 h-2.5 w-2.5 flex-none rounded-full ${n.read_at ? "bg-transparent" : "bg-brand"}`} />
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-[15px] ${n.read_at ? "font-semibold" : "font-extrabold"}`}>
                        {n.title}
                        {!n.read_at ? <span className="sr-only"> (sin leer)</span> : null}
                        {n.type === "supervision" ? <span className="ml-2 rounded-full bg-[#EDEDEA] px-2 py-0.5 align-middle text-[11px] font-extrabold uppercase tracking-[0.04em] text-ink-2">Supervisión</span> : null}
                        {n.priority === "high" ? <span className="ml-2 rounded-full bg-[#FFF6E8] px-2 py-0.5 align-middle text-[11px] font-extrabold uppercase tracking-[0.04em] text-ink">Importante</span> : null}
                      </span>
                    </span>
                    {n.body ? <span className="text-[14px] text-ink-2">{n.body}</span> : null}
                    <span className="text-[12px] font-semibold text-muted">{fmtDateTime(n.created_at)}</span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}
      <PushCard publicKey={publicKey} />
      <SoundToggle />
      <PrefsForm email={prefs?.email_enabled ?? true} />
    </section>
  );

  // El personal ve los avisos dentro de su panel (riel/barra inferior); el cliente conserva su cabecera.
  if (staff) {
    return (
      <StaffShell name={profile.full_name} isAdmin={profile.role === "superadmin"} unread={unread}>
        {content}
      </StaffShell>
    );
  }
  return (
    <ClientShell name={profile.full_name} unread={unread}>
      {content}
    </ClientShell>
  );
}
