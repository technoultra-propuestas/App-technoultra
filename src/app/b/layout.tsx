import { AppHeader } from "@/components/ui/AppHeader";
import { StaffNav } from "@/components/ui/StaffNav";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["technician", "admin"]);
  const { count: unread } = await (await createClient()).from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("channel", "in_app");
  return (
    <div className="min-h-screen-dvh">
      <AppHeader home="/b" name={profile.full_name} roleLabel={profile.role === "admin" ? "Administración" : "Técnico"} unread={unread ?? 0} />
      <StaffNav isAdmin={profile.role === "admin"} />
      <div className="pb-safe mx-auto max-w-[1040px] px-5 pb-10 pt-6">{children}</div>
    </div>
  );
}
