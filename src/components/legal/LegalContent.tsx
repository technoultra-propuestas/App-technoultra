import { parseLegalText, slugifyHeading } from "@/lib/domain/legal";

/** Marca visualmente los campos «[PENDIENTE: …]» (solo se ven en borradores: la BD impide publicar con ellos). */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\[PENDIENTE:[^\]]*\])/g);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith("[PENDIENTE:") ? (
          <mark key={i} className="rounded bg-[#FFE9A8] px-1 font-bold text-ink">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  );
}

/** Documento legal con índice por secciones. Lee texto plano de la base de datos y lo muestra escapado (nunca como HTML). */
export function LegalContent({ content }: { content: string }) {
  const blocks = parseLegalText(content);
  const toc = blocks.filter((b) => b.type === "h2").map((b) => ({ id: slugifyHeading(b.text!), text: b.text! }));
  return (
    <div className="flex flex-col gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:gap-10">
      {toc.length > 3 ? (
        <nav aria-label="Contenido del documento" className="lg:sticky lg:top-6 lg:h-fit">
          <details className="rounded-[14px] border border-line bg-white p-4 lg:border-0 lg:bg-transparent lg:p-0" open>
            <summary className="cursor-pointer text-[13px] font-extrabold tracking-[0.04em] text-muted lg:cursor-default">CONTENIDO</summary>
            <ol className="m-0 mt-3 flex list-none flex-col gap-0.5 p-0 text-[14px] font-semibold">
              {toc.map((t) => (
                <li key={t.id}>
                  <a href={`#${t.id}`} className="flex min-h-9 items-center text-ink-2 no-underline hover:text-ink">
                    {t.text}
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>
      ) : (
        <span className="hidden lg:block" />
      )}
      <article className="flex min-w-0 flex-col gap-4 text-base leading-relaxed text-ink-2">
        {blocks.map((b, i) =>
          b.type === "h2" ? (
            <h2 key={i} id={slugifyHeading(b.text!)} className="m-0 mt-4 scroll-mt-6 text-[20px] font-extrabold tracking-[-0.01em] text-ink">
              <Inline text={b.text!} />
            </h2>
          ) : b.type === "h3" ? (
            <h3 key={i} className="m-0 mt-2 text-[17px] font-extrabold text-ink">
              <Inline text={b.text!} />
            </h3>
          ) : b.type === "ul" ? (
            <ul key={i} className="m-0 flex list-disc flex-col gap-1.5 pl-5">
              {b.items!.map((it, j) => (
                <li key={j}>
                  <Inline text={it} />
                </li>
              ))}
            </ul>
          ) : (
            <p key={i} className="m-0">
              <Inline text={b.text!} />
            </p>
          ),
        )}
      </article>
    </div>
  );
}
