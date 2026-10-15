import type { Metadata } from "next";
import { requireRole } from "@/lib/auth/session";
import { AssistantChat } from "./chat";
import { BackLink } from "@/components/ui/kit";

export const metadata: Metadata = { title: "Asistente", robots: { index: false } };

export default async function AssistantPage() {
  await requireRole(["client"]);
  return (
    <section className="mx-auto flex w-full max-w-[640px] flex-col gap-5">
      <BackLink href="/c/mas">Volver a Más</BackLink>
      <div>
        <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Asistente TechnoUltra</h1>
        <p className="m-0 mt-1 text-[15px] text-muted">Te ayudo a elegir un servicio y a entender precios, cobertura y el estado de tus solicitudes.</p>
      </div>
      <AssistantChat />
    </section>
  );
}
