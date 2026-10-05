import type { Metadata } from "next";
import { Card, LinkButton, PageTitle } from "@/components/ui/layout";
import { requireRole } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Solicitud enviada", robots: { index: false } };

export default async function RequestDonePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requireRole(["client"]);
  const code = ((await searchParams).c ?? "").slice(0, 20).replace(/[^A-Z0-9-]/gi, "");
  return (
    <section className="mx-auto flex w-full max-w-[520px] flex-col gap-6">
      <PageTitle
        title="¡Solicitud enviada!"
        subtitle="Nuestro equipo la revisará y te avisará aquí mismo. No hacemos ningún trabajo sin tu aprobación."
      />
      <Card className="flex flex-col gap-1">
        <span className="text-[13px] font-bold text-muted">Código de tu solicitud</span>
        <span className="text-[24px] font-extrabold">{code || "—"}</span>
      </Card>
      <LinkButton href="/c/tickets">Ver mis solicitudes</LinkButton>
    </section>
  );
}
