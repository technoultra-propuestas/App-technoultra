import { BackLink } from "@/components/ui/kit";

type Props = {
  docId: string;
  code: string;
  title: string;
  version: number;
  statusLabel: string;
  back: { href: string; label: string };
};

/**
 * Visor de documentos DENTRO de la app: cabecera con la flecha «volver» (al contexto real), acciones de abrir/descargar y el PDF incrustado.
 * El PDF lo sigue entregando `/documentos/<id>` (autorizado por RLS y sin exponer almacenamiento); aquí solo se muestra. En iPhone/iPad el
 * navegador no despliega bien un PDF dentro de un marco: por eso «Abrir» y «Descargar» están siempre a la vista.
 */
export function DocumentFrame({ docId, code, title, version, statusLabel, back }: Props) {
  return (
    <section className="mx-auto flex w-full max-w-[1100px] flex-col gap-4">
      <BackLink href={back.href}>{back.label}</BackLink>
      <header className="flex flex-col gap-3 rounded-card bg-ink p-5 text-white shadow-card sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex min-w-0 flex-col gap-1">
          <span className="text-[12px] font-extrabold uppercase tracking-[0.05em] text-[#B9B9B4]">{code} · versión {version}</span>
          <h1 className="m-0 text-[22px] font-extrabold leading-tight tracking-[-0.02em] text-brand sm:text-[24px]">{title}</h1>
          <p className="m-0 text-[14px] font-bold text-[#D6D6D2]">{statusLabel}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <a href={`/documentos/${docId}`} target="_blank" rel="noreferrer" className="press flex min-h-11 items-center justify-center rounded-[12px] bg-brand px-4 text-[14px] font-extrabold text-ink no-underline">
            Abrir en una pestaña nueva
          </a>
          <a href={`/documentos/${docId}?descargar=1`} className="press flex min-h-11 items-center justify-center rounded-[12px] border border-[#4A4A47] px-4 text-[14px] font-extrabold text-white no-underline">
            Descargar
          </a>
        </div>
      </header>
      <iframe src={`/documentos/${docId}`} title={`${title} (PDF)`} className="h-[75vh] min-h-[420px] w-full rounded-card border border-line bg-white shadow-card" />
      <BackLink href={back.href}>{back.label}</BackLink>
    </section>
  );
}
