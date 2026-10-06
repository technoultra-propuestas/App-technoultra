"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { NavIcon, type NavIconName } from "@/components/ui/icons";
import { SignOutIcon } from "@/components/ui/SignOut";

/**
 * Navegación común del producto (riel en escritorio, barra inferior en móvil). La usan el panel del personal y la app del
 * cliente: solo cambian los destinos. Es presentación: el acceso a cada ruta lo decide el servidor y las políticas RLS.
 */
export type NavItem = { href: string; label: string; icon: NavIconName; exact?: boolean; also?: string[] };

const hit = (path: string, p: string) => path === p || path.startsWith(p + "/");
const isOn = (path: string, i: NavItem) => (i.exact ? path === i.href : hit(path, i.href) || (i.also ?? []).some((a) => hit(path, a)));

function initialsOf(name: string) {
  const p = (name ?? "").trim().split(/\s+/).filter(Boolean);
  return p.length ? (p[0][0] + (p.length > 1 ? p[p.length - 1][0] : "")).toUpperCase() : "•";
}

type Common = { items: NavItem[]; moreHref: string; moreAlso?: string[] };

export function RailNav({ items, moreHref, home, accountHref, name, unread }: Common & { home: string; accountHref: string; name: string; unread: number }) {
  const path = usePathname();
  const moreOn = !items.some((i) => isOn(path, i)) && path !== "/avisos";
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[84px] flex-col items-center bg-rail py-4 lg:flex">
      <Link href={home} aria-label="TechnoUltra — Inicio" className="press mb-3 flex h-11 w-11 items-center justify-center overflow-hidden rounded-full bg-white">
        {/* eslint-disable-next-line @next/next/no-img-element -- logo local pequeño */}
        <img src="/logo-technoultra.png" alt="" width={44} height={44} className="h-11 w-11 object-cover" />
      </Link>
      <nav aria-label="Principal" className="flex w-full flex-1 flex-col items-center gap-1 overflow-y-auto px-2">
        {items.map((i) => (
          <RailLink key={i.href} href={i.href} label={i.label} icon={i.icon} on={isOn(path, i)} />
        ))}
        <RailLink href={moreHref} label="Más" icon="more" on={moreOn} />
      </nav>
      <div className="flex flex-col items-center gap-2 pt-2">
        <Link
          href="/avisos"
          aria-label={unread > 0 ? `Avisos, ${unread} sin leer` : "Avisos"}
          aria-current={path === "/avisos" ? "page" : undefined}
          className={`press relative flex h-11 w-11 items-center justify-center rounded-[14px] text-white ${path === "/avisos" ? "bg-[#2A2A2A]" : "hover:bg-[#1F1F1F]"}`}
        >
          <NavIcon name="bell" width={22} height={22} />
          {unread > 0 ? <span className="absolute -right-0.5 -top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-brand px-1 text-[11px] font-extrabold text-ink">{unread > 9 ? "9+" : unread}</span> : null}
        </Link>
        <Link href={accountHref} aria-label={`Mi cuenta: ${name}`} className="press flex h-11 w-11 items-center justify-center rounded-full bg-[#2A2A2A] text-[13px] font-extrabold text-brand">
          {initialsOf(name)}
        </Link>
        <SignOutIcon dark />
      </div>
    </aside>
  );
}

function RailLink({ href, label, icon, on }: { href: string; label: string; icon: NavIconName; on: boolean }) {
  return (
    <Link href={href} aria-current={on ? "page" : undefined} className={`press flex min-h-[58px] w-full flex-col items-center justify-center gap-1 rounded-[14px] no-underline ${on ? "bg-[#2A2A2A] text-brand" : "text-[#C9C9C5] hover:bg-[#1F1F1F]"}`}>
      <NavIcon name={icon} width={22} height={22} />
      <span className={`text-[11px] leading-none ${on ? "font-extrabold text-white" : "font-bold"}`}>{label}</span>
    </Link>
  );
}

/** `items` ya trae solo los destinos de la barra; «Más» se añade al final y agrupa el resto. */
export function BottomNav({ items, moreHref, moreAlso }: Common) {
  const path = usePathname();
  const all: NavItem[] = [...items, { href: moreHref, label: "Más", icon: "more", also: moreAlso }];
  const moreOn = !items.some((i) => isOn(path, i)) && path !== "/avisos";
  return (
    <nav aria-label="Principal" className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 backdrop-blur lg:hidden">
      <ul className="m-0 mx-auto flex max-w-[640px] list-none p-0">
        {all.map((i) => {
          const on = i.href === moreHref ? moreOn : isOn(path, i);
          return (
            <li key={i.href} className="flex-1">
              <Link href={i.href} aria-current={on ? "page" : undefined} className={`press relative flex min-h-[56px] flex-col items-center justify-center gap-1 no-underline ${on ? "text-ink" : "text-muted"}`}>
                {on ? <span aria-hidden className="absolute inset-x-5 top-0 h-[3px] rounded-b-full bg-brand" /> : null}
                <NavIcon name={i.icon} width={22} height={22} />
                <span className={`text-[11px] leading-none ${on ? "font-extrabold" : "font-semibold"}`}>{i.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
