import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { DocumentFrame } from "@/components/documents/DocumentFrame";
import { requireRole } from "@/lib/auth/session";
import { backTarget } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Documento", robots: { index: false } };

const STATUS: Record<string, string> = { generated: "Pendiente de revisar", sent: "Pendiente de revisar", viewed: "Pendiente de firmar", signed: "Firmado", rejected: "Rechazado", superseded: "Reemplazado por una versión nueva" };

/** Visor del PDF para el cliente, dentro de la app y con salida clara: vuelve al ticket/cotización/lista desde donde se abrió (o a la ficha del documento). */
export default async function ClientDocumentViewer({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ from?: string }> }) {
  await requireRole(["client"]);
  const id = z.string().uuid().safeParse((await params).id);
  if (!id.success) notFound();
  const { data: doc } = await (await createClient()).from("documents").select("id, code, title, version, status").eq("id", id.data).maybeSingle();
  if (!doc) notFound();
  const back = backTarget((await searchParams).from, { href: `/c/documentos/${doc.id}`, label: "Volver al documento" });
  return <DocumentFrame docId={doc.id} code={doc.code} title={doc.title} version={doc.version} statusLabel={STATUS[doc.status] ?? doc.status} back={back} />;
}
