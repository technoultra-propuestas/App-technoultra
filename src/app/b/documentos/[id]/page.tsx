import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentFrame } from "@/components/documents/DocumentFrame";
import { requireRole } from "@/lib/auth/session";
import { backTarget } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documento", robots: { index: false } };

const STATUS: Record<string, string> = { generated: "Generado", sent: "Enviado", viewed: "Visto por el cliente", signed: "Firmado", rejected: "Rechazado", superseded: "Reemplazado", draft: "Borrador" };

/** Visor del PDF para el personal: vuelve al ticket desde donde se abrió (RLS: solo documentos de tickets que el personal puede ver). */
export default async function StaffDocumentViewer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  await requireRole(["technician", "superadmin"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { data: doc } = await (await createClient()).from("documents").select("id, code, title, version, status, ticket_id").eq("id", id.data).maybeSingle();
  if (!doc) notFound();
  const fallback = doc.ticket_id ? { href: `/b/tickets/${doc.ticket_id}`, label: "Volver al ticket" } : { href: "/b/tickets", label: "Volver a tickets" };
  return <DocumentFrame docId={doc.id} code={doc.code} title={doc.title} version={doc.version} statusLabel={STATUS[doc.status] ?? doc.status} back={backTarget((await searchParams).from, fallback)} />;
}
