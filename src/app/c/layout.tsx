import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AppHeader } from "@/components/ui/AppHeader";
import { ClientNav } from "@/components/ui/ClientNav";
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
    <div className="min-h-screen-dvh">
      <AppHeader home="/c" name={profile.full_name} roleLabel="Cliente" unread={unread ?? 0} />
      <ClientNav />
      <div id="contenido" tabIndex={-1} className="mx-auto max-w-[1040px] px-5 pb-28 pt-6 outline-none md:pb-10">{children}</div>
    </div>
  );
}
