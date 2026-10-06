import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ClientShell } from "@/components/ui/ClientShell";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireRole(["client"]);
  if (!profile.onboarding_completed_at) redirect("/onboarding");
  // Si se publicó una versión legal nueva que exige aceptación, se pide antes de seguir (la página /c/legal es la única excepción).
  const hdrs = await headers();
  const supabase = await createClient();
  const { data: pending } = await supabase.rpc("pending_legal_documents");
  const onLegal = (hdrs.get("x-pathname") ?? "").startsWith("/c/legal");
  if ((pending ?? []).length > 0 && !onLegal) redirect("/c/legal");
  const { count: unread } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("channel", "in_app");
  return (
    <ClientShell name={profile.full_name} unread={unread ?? 0}>
      {children}
    </ClientShell>
  );
}
