import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { fmtDateTime } from "@/components/ui/layout";
import { Section, TextLink } from "@/components/ui/kit";
import { requireRole } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { EntryForm } from "../entry-form";

export const metadata: Metadata = { title: "Editar entrada", robots: { index: false } };

export default async function EditKnowledgeEntryPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole(["superadmin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const supabase = await createClient();
  const [{ data: e }, { data: versions }] = await Promise.all([
    supabase.from("knowledge_entries").select("id, category, title, question, answer, keywords, status, priority, source_type, source_id, uses_ai, version").eq("id", id.data).maybeSingle(),
    supabase.from("knowledge_entry_versions").select("version, changed_at, snapshot").eq("entry_id", id.data).order("version", { ascending: false }).limit(20),
  ]);
  if (!e) notFound();
  return (
    <section className="mx-auto flex w-full max-w-[720px] flex-col gap-5">
      <TextLink href="/b/conocimiento" className="w-fit">
        ← Centro de conocimiento
      </TextLink>
      <h1 className="m-0 text-[28px] font-extrabold tracking-[-0.025em]">Editar entrada</h1>
      <EntryForm entry={e} />
      <Section title={`Historial · versión actual ${e.version}`}>
        <ul className="m-0 flex list-none flex-col divide-y divide-line p-0 text-[14px]">
          {(versions ?? []).map((v) => (
            <li key={v.version} className="flex items-center justify-between gap-3 py-2.5">
              <span className="font-extrabold">v{v.version}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{String((v.snapshot as { status?: string; title?: string })?.title ?? "")} · {String((v.snapshot as { status?: string })?.status ?? "")}</span>
              <span className="flex-none text-[12.5px] font-semibold text-muted">{fmtDateTime(v.changed_at)}</span>
            </li>
          ))}
        </ul>
      </Section>
    </section>
  );
}
