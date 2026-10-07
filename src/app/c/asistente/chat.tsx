"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { NavIcon } from "@/components/ui/icons";
import { haptic } from "@/lib/haptics";
import type { AssistantReply } from "@/lib/assistant/router";
import { askAssistantAction } from "./actions";

type Msg = { from: "me"; text: string } | { from: "bot"; reply: AssistantReply } | { from: "error"; text: string };
const QUICK = ["¿Cuánto cuesta el diagnóstico?", "No sé qué servicio necesito", "¿Dónde está mi solicitud?", "¿Atienden en Palmira?"];

export function AssistantChat() {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const end = useRef<HTMLDivElement>(null);

  function send(raw: string) {
    const message = raw.trim();
    if (!message || pending) return;
    setMsgs((m) => [...m, { from: "me", text: message }]);
    setText("");
    start(async () => {
      const r = await askAssistantAction({ message });
      setMsgs((m) => [...m, r.ok ? { from: "bot", reply: r.reply } : { from: "error", text: r.error }]);
      haptic("tap");
      setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div role="log" aria-live="polite" className="flex min-h-[320px] flex-col gap-3 rounded-card border border-line bg-white p-4 shadow-card">
        <Bubble bot>
          <p className="m-0">¡Hola! Soy el asistente de TechnoUltra. Cuéntame qué le pasa a tu equipo o pregúntame por servicios, precios, cobertura o el estado de tu solicitud.</p>
        </Bubble>
        {msgs.map((m, i) =>
          m.from === "me" ? (
            <div key={i} className="enter ml-auto max-w-[85%] rounded-[18px] rounded-br-[6px] bg-ink px-4 py-2.5 text-[15px] font-semibold text-white">
              {m.text}
            </div>
          ) : m.from === "error" ? (
            <Bubble key={i} bot>
              <p role="alert" className="m-0 text-danger">
                {m.text}
              </p>
            </Bubble>
          ) : (
            <Bubble key={i} bot>
              <p className="m-0">{m.reply.text}</p>
              {m.reply.suggestions?.length ? (
                <ul className="m-0 mt-3 flex list-none flex-col gap-2 p-0">
                  {m.reply.suggestions.map((s) => (
                    <li key={s.slug}>
                      <Link href={`/c/solicitar/${s.slug}`} className="press flex min-h-12 items-center justify-between gap-3 rounded-[14px] border border-line-strong bg-white px-4 py-2 text-ink no-underline">
                        <span className="flex min-w-0 flex-col">
                          <span className="truncate text-[14px] font-extrabold">{s.name}</span>
                          <span className="text-[12.5px] font-semibold text-muted">{s.priceLabel}</span>
                        </span>
                        <span className="flex-none text-[13px] font-extrabold text-brand">Elegir</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : null}
              {m.reply.links?.length ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {m.reply.links.map((l) => (
                    <Link key={l.href} href={l.href} className="press inline-flex min-h-11 items-center rounded-chip border border-line-strong bg-white px-4 text-[13.5px] font-extrabold text-ink no-underline">
                      {l.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </Bubble>
          ),
        )}
        {pending ? (
          <Bubble bot>
            <span className="text-muted">Escribiendo…</span>
          </Bubble>
        ) : null}
        <div ref={end} />
      </div>

      {msgs.length === 0 ? (
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <button key={q} type="button" onClick={() => send(q)} className="press min-h-11 rounded-chip border border-line bg-white px-4 text-[13.5px] font-extrabold text-ink">
              {q}
            </button>
          ))}
        </div>
      ) : null}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
        }}
        className="flex items-center gap-2"
      >
        <label className="sr-only" htmlFor="assistant-input">
          Tu consulta
        </label>
        <input
          id="assistant-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          autoComplete="off"
          enterKeyHint="send"
          placeholder="Escribe tu consulta…"
          className="h-14 min-w-0 flex-1 rounded-card border border-line bg-white px-4 text-[16px] font-semibold text-ink shadow-card placeholder:text-muted"
        />
        <button type="submit" disabled={pending || !text.trim()} aria-label="Enviar" className="press flex h-14 w-14 flex-none items-center justify-center rounded-card bg-brand text-ink shadow-card disabled:opacity-50">
          <NavIcon name="chevron" width={22} height={22} />
        </button>
      </form>
      <p className="m-0 text-[12px] leading-snug text-muted">El asistente orienta, pero no reemplaza el diagnóstico técnico ni aprueba pagos o cotizaciones. Si no puede ayudarte, puedes continuar manualmente.</p>
    </div>
  );
}

function Bubble({ bot, children }: { bot?: boolean; children: React.ReactNode }) {
  return (
    <div className={`enter flex gap-2.5 ${bot ? "" : "justify-end"}`}>
      {bot ? (
        <span aria-hidden className="mt-0.5 flex h-8 w-8 flex-none items-center justify-center rounded-full bg-ink text-[11px] font-extrabold text-brand">
          TU
        </span>
      ) : null}
      <div className="max-w-[88%] rounded-[18px] rounded-tl-[6px] bg-paper px-4 py-3 text-[15px] font-semibold leading-snug text-ink">{children}</div>
    </div>
  );
}
