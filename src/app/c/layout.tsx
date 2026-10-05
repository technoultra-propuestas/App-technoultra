import { redirect } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { ClientNav } from "@/components/ui/ClientNav";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["client"]);
  if (!profile.onboarding_completed_at) redirect("/onboarding");
  const { count: unread } = await (await createClient()).from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("channel", "in_app");
  return (
    <div className="min-h-screen-dvh">
      <AppHeader home="/c" name={profile.full_name} roleLabel="Cliente" unread={unread ?? 0} />
      <ClientNav />
      <div className="mx-auto max-w-[1040px] px-5 pb-28 pt-6 md:pb-10">{children}</div>
    </div>
  );
}
