import type { Metadata } from "next";
import { TextLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { EntryForm } from "../entry-form";

export const metadata: Metadata = { title: "Nueva entrada", robots: { index: false } };

export default async function NewKnowledgeEntryPage() {
  await requireRole(["superadmin"]);
  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <TextLink href="/b/conocimiento" className="w-fit">
        ← Centro de conocimiento
      </TextLink>
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Nueva entrada</h1>
      <EntryForm />
    </section>
  );
}
