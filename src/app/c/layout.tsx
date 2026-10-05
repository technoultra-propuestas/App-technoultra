import { redirect } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { requireRole } from "@/lib/auth/session";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["client"]);
  if (!profile.onboarding_completed_at) redirect("/onboarding");
  return (
    <div className="min-h-screen-dvh">
      <AppHeader home="/c" name={profile.full_name} roleLabel="Cliente" />
      <div className="pb-safe mx-auto max-w-[1040px] px-5 pb-10 pt-6">{children}</div>
    </div>
  );
}
