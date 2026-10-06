import { StaffShell } from "@/components/ui/StaffShell";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["technician", "superadmin"]);
  const { count: unread } = await (await createClient()).from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("channel", "in_app");
  return (
    <StaffShell name={profile.full_name} isAdmin={profile.role === "superadmin"} unread={unread ?? 0}>
      {children}
    </StaffShell>
  );
}
