import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { Card, EmptyState, fmtDateTime, PageTitle } from "@/components/ui/layout";
import { getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { markAllReadAction, openNotificationAction } from "./actions";

export const metadata: Metadata = { title: "Avisos", robots: { index: false } };

export default async function NotificationsPage() {
  const profile = await getProfile();
  if (!profile || !profile.is_active) redirect("/login");
  const home = profile.role === "client" ? "/c" : "/b";
  const supabase = await createClient();
  const { data } = await supabase.from("notifications").select("id, title, body, created_at, read_at").eq("channel", "in_app").order("created_at", { ascending: false }).limit(100);
  const list = data ?? [];
  const unread = list.filter((n) => !n.read_at).length;
  return (
    <div className="min-h-screen-dvh">
      <AppHeader home={home} name={profile.full_name} roleLabel={profile.role === "superadmin" ? "Superadmin" : profile.role === "technician" ? "Técnico" : "Cliente"} unread={unread} />
      <section className="mx-auto flex max-w-[640px] flex-col gap-6 px-5 pb-10 pt-6">
        <PageTitle
          title="Avisos"
          action={
            unread > 0 ? (
              <form action={markAllReadAction}>
                <button type="submit" className="min-h-11 rounded-[14px] border border-line-strong bg-white px-4 text-[14px] font-extrabold">
                  Marcar todo como leído
                </button>
              </form>
            ) : null
          }
        />
        {list.length === 0 ? (
          <EmptyState title="No tienes avisos" text="Te avisaremos aquí cuando tu servicio avance o tengas algo por revisar." />
        ) : (
          <ul className="m-0 flex list-none flex-col gap-2 p-0">
            {list.map((n) => (
              <li key={n.id}>
                <form action={openNotificationAction}>
                  <input type="hidden" name="id" value={n.id} />
                  <button type="submit" className="block w-full text-left">
                    <Card className={`flex flex-col gap-1 ${n.read_at ? "" : "border-brand"}`}>
                      <div className="flex items-start justify-between gap-3">
                        <span className={`text-[15px] ${n.read_at ? "font-semibold" : "font-extrabold"}`}>{n.title}</span>
                        {!n.read_at ? <span aria-label="Sin leer" className="mt-1.5 h-2.5 w-2.5 flex-none rounded-full bg-brand" /> : null}
                      </div>
                      {n.body ? <span className="text-[14px] text-muted">{n.body}</span> : null}
                      <span className="text-[12px] text-muted">{fmtDateTime(n.created_at)}</span>
                    </Card>
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
