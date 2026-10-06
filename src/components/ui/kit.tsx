import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { NavIcon, type NavIconName } from "@/components/ui/icons";

/**
 * Piezas reutilizables del panel y la app (Fase 2 del rediseño). Son componentes de servidor: no llevan estado.
 * Reglas: objetivos táctiles ≥ 44 px (HIG accessibility.md), contraste AA y movimiento corto (.press).
 */

/** Iniciales para el avatar: «Juan Pérez» → «JP». Nunca inventa datos: si no hay nombre devuelve «•». */
export const initials = (name: string | null | undefined) => {
  const p = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (!p.length) return "•";
  return (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase();
};

export function Avatar({ name, size = 44 }: { name: string | null | undefined; size?: number }) {
  return (
    <span aria-hidden className="inline-flex flex-none items-center justify-center rounded-full bg-ink font-extrabold text-brand" style={{ width: size, height: size, fontSize: size * 0.34 }}>
      {initials(name)}
    </span>
  );
}

/** Cifra destacada. `tone="dark"` es la tarjeta oscura del mockup (la métrica principal). */
export function StatCard({ value, label, icon, tone = "light", href }: { value: ReactNode; label: string; icon?: NavIconName; tone?: "light" | "dark"; href?: string }) {
  const dark = tone === "dark";
  const body = (
    <div className={`press flex h-full min-h-[132px] flex-col justify-between gap-4 rounded-card p-5 shadow-card ${dark ? "bg-ink text-white" : "border border-line bg-white text-ink"}`}>
      {icon ? <NavIcon name={icon} width={22} height={22} className={dark ? "text-brand" : "text-ink"} /> : <span />}
      <div>
        <div className="text-[34px] font-extrabold leading-none tracking-[-0.02em]">{value}</div>
        <div className={`mt-1.5 text-[14px] font-semibold ${dark ? "text-[#D6D6D2]" : "text-muted"}`}>{label}</div>
      </div>
    </div>
  );
  return href ? (
    <Link href={href} className="block rounded-card no-underline">
      {body}
    </Link>
  ) : (
    body
  );
}

/** Fila de lista con icono, título, detalle y flecha (patrón «Requieren acción» del mockup). */
export function ListRow({ href, title, detail, icon, tone = "info", trailing }: { href: string; title: ReactNode; detail?: ReactNode; icon?: NavIconName; tone?: "info" | "warn" | "ok" | "neutral"; trailing?: ReactNode }) {
  const tones = { info: "bg-info-soft text-info", warn: "bg-warn-soft text-warn", ok: "bg-ok-soft text-ok", neutral: "bg-[#EDEDEA] text-ink-2" };
  return (
    <Link href={href} className="press flex min-h-[64px] items-center gap-3.5 rounded-[14px] px-2 py-2.5 text-ink no-underline hover:bg-paper">
      {icon ? (
        <span aria-hidden className={`flex h-10 w-10 flex-none items-center justify-center rounded-[12px] ${tones[tone]}`}>
          <NavIcon name={icon} width={20} height={20} />
        </span>
      ) : null}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[15px] font-extrabold">{title}</span>
        {detail ? <span className="truncate text-[13px] font-semibold text-muted">{detail}</span> : null}
      </span>
      {trailing}
      <NavIcon name="chevron" width={18} height={18} aria-hidden className="flex-none text-ink" />
    </Link>
  );
}

/** Chip de filtro como enlace (el filtro vive en la URL: se puede compartir y funciona sin JavaScript). */
export function FilterChip({ href, children, count, on }: { href: string; children: ReactNode; count?: number; on?: boolean }) {
  return (
    <Link
      href={href}
      aria-current={on ? "true" : undefined}
      className={`press inline-flex min-h-11 flex-none items-center gap-1.5 rounded-chip border px-4 text-[14px] font-extrabold no-underline ${on ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}
    >
      {children}
      {count !== undefined ? <span className={on ? "text-[#D6D6D2]" : "text-muted"}>· {count}</span> : null}
    </Link>
  );
}

/** Fila de chips con desplazamiento horizontal (sin barra visible en móvil). */
export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <nav aria-label={label} className="-mx-5 overflow-x-auto px-5 pb-1 [scrollbar-width:thin]">
      <div className="flex gap-2">{children}</div>
    </nav>
  );
}

/** Buscador por GET: el término va en la URL (`?q=`), se procesa en el servidor y no requiere JavaScript. */
export function SearchField({ placeholder, defaultValue, keep }: { placeholder: string; defaultValue?: string; keep?: Record<string, string | undefined> }) {
  return (
    <form role="search" className="relative">
      {Object.entries(keep ?? {}).map(([k, v]) => (v ? <input key={k} type="hidden" name={k} value={v} /> : null))}
      <svg aria-hidden viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        type="search"
        name="q"
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        enterKeyHint="search"
        className="h-14 w-full rounded-card border border-line bg-white pl-12 pr-4 text-[16px] font-semibold text-ink shadow-card placeholder:text-muted"
      />
    </form>
  );
}

/** Contenedor de título de sección dentro de una tarjeta. */
export function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-card border border-line bg-white p-5 shadow-card">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="m-0 text-[18px] font-extrabold tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Botón-enlace secundario compacto (p. ej. «Ver agenda»). */
export function TextLink(props: ComponentProps<typeof Link>) {
  return <Link {...props} className={`press inline-flex min-h-11 items-center text-[14px] font-extrabold text-ink underline decoration-brand underline-offset-[3px] ${props.className ?? ""}`} />;
}

/** Botón primario naranja (acción principal de la pantalla). */
export function PrimaryLink({ icon, children, ...props }: { icon?: NavIconName } & ComponentProps<typeof Link>) {
  return (
    <Link {...props} className={`press inline-flex min-h-12 items-center justify-center gap-2 rounded-[14px] bg-brand px-5 text-[15px] font-extrabold text-ink no-underline shadow-card ${props.className ?? ""}`}>
      {icon ? <NavIcon name={icon} width={18} height={18} /> : null}
      {children}
    </Link>
  );
}

/** Pestañas segmentadas como enlaces (el destino es una ruta: funciona sin JavaScript y se puede compartir). */
export function SegmentTabs({ label, items, active }: { label: string; items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <div role="group" aria-label={label} className="grid w-full max-w-[420px] rounded-card border border-line bg-white p-1 shadow-card" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map((i) => (
        <Link key={i.key} href={i.href} aria-current={active === i.key ? "page" : undefined} className={`press flex min-h-11 items-center justify-center rounded-[16px] px-3 text-[15px] font-extrabold no-underline ${active === i.key ? "bg-ink text-white" : "text-ink"}`}>
          {i.label}
        </Link>
      ))}
    </div>
  );
}
