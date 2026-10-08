import { CartBadge } from "@/components/shop/CartBadge";
import { DraftProvider } from "@/components/forms/FormDraft";
import { SiteShell } from "@/components/site/SiteShell";
import { ClientShell } from "@/components/ui/ClientShell";
import { getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

/**
 * Envoltorio del Shop. Con una sesión de cliente el Shop vive DENTRO de la app (misma navegación inferior/lateral que el resto);
 * para visitantes y personal se mantiene la estructura pública. La decisión se toma en el servidor con el perfil de la base de datos.
 */
export async function ShopShell({ children }: { children: React.ReactNode }) {
  const profile = await getProfile();
  if (profile && profile.is_active && profile.role === "client") {
    const supabase = await createClient();
    const { count } = await supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null).eq("channel", "in_app");
    return (
      <DraftProvider scope={profile.id}>
        <ClientShell name={profile.full_name} unread={count ?? 0} wide>
          <div className="-mt-1 mb-3 flex justify-end">
            <CartBadge />
          </div>
          {children}
        </ClientShell>
      </DraftProvider>
    );
  }
  return <SiteShell wide>{children}</SiteShell>;
}
