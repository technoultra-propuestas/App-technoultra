"use client";

import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { buildDraft, draftKey, parseDraft, shouldPersist } from "@/lib/drafts";

const ScopeContext = createContext("anon");

/** Identifica a quién pertenecen los borradores (id de la persona con sesión; «anon» antes de iniciarla). */
export function DraftProvider({ scope, children }: { scope: string; children: ReactNode }) {
  return <ScopeContext.Provider value={scope}>{children}</ScopeContext.Provider>;
}

type El = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

/** Asigna un valor como lo haría una persona, para que los campos controlados de React también se enteren. */
function setNative(el: El, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (!setter) return;
  setter.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
  el.dispatchEvent(new Event("change", { bubbles: true }));
}

/**
 * Memoria de formulario. Se coloca DENTRO de un `<form>`: guarda lo que la persona escribe (con pausa de 400 ms), lo restaura al volver o
 * recargar y lo borra al enviar. Un mecanismo común para todos los formularios; no depende de cómo estén hechos los campos.
 */
export function FormDraft({ id, ttlMs, restoreFirst = true, skip = [] }: { id: string; ttlMs?: number; restoreFirst?: boolean; skip?: string[] }) {
  const skipKey = skip.join(",");
  const marker = useRef<HTMLSpanElement>(null);
  const scope = useContext(ScopeContext);
  const path = usePathname();

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const key = draftKey(scope, path, id);
    let timer: ReturnType<typeof setTimeout> | undefined;
    let submittedAt = 0;
    let snapshot: Record<string, string> | null = null;

    const collect = () => {
      const out: Record<string, string> = {};
      for (const el of Array.from(form.elements) as El[]) {
        const name = el.getAttribute("name") ?? "";
        const type = (el as HTMLInputElement).type ?? "";
        if (!shouldPersist(name, type)) continue;
        if (type === "checkbox") {
          out[name] = (el as HTMLInputElement).checked ? "on" : "";
          continue;
        }
        if (type === "radio") {
          if ((el as HTMLInputElement).checked) out[name] = el.value;
          continue;
        }
        out[name] = el.value;
      }
      return out;
    };
    const store = (values: Record<string, string>) => {
      try {
        const d = buildDraft(values);
        if (d) localStorage.setItem(key, JSON.stringify(d));
        else localStorage.removeItem(key);
      } catch {
        /* sin almacenamiento: el formulario funciona igual */
      }
    };
    // Campos que NO se restauran (p. ej. el equipo recién creado que llega por la URL debe ganar sobre un borrador viejo).
    const skipped = new Set(skipKey ? skipKey.split(",") : []);
    const apply = (values: Record<string, string>) => {
      for (const [name, value] of Object.entries(values)) {
        if (skipped.has(name)) continue;
        const els = Array.from(form.elements).filter((e) => (e as El).getAttribute("name") === name) as El[];
        for (const el of els) {
          const type = (el as HTMLInputElement).type ?? "";
          if (!shouldPersist(name, type)) continue;
          if (type === "checkbox") {
            const want = value === "on";
            if ((el as HTMLInputElement).checked !== want) (el as HTMLInputElement).click();
          } else if (type === "radio") {
            if (el.value === value && !(el as HTMLInputElement).checked) (el as HTMLInputElement).click();
          } else if (el instanceof HTMLSelectElement) {
            if (Array.from(el.options).some((o) => o.value === value)) setNative(el, value);
          } else if (el.value !== value) setNative(el, value);
        }
      }
    };
    const onEdit = () => {
      submittedAt = 0;
      clearTimeout(timer);
      timer = setTimeout(() => store(collect()), 400);
    };
    const onSubmit = () => {
      submittedAt = Date.now();
      snapshot = collect();
      try {
        localStorage.removeItem(key);
      } catch {
        /* nada */
      }
      // Si el formulario sigue en pantalla pasados unos segundos, el envío falló (validación/servidor): se conserva lo escrito.
      setTimeout(() => {
        if (submittedAt && snapshot && document.contains(form)) store(snapshot);
      }, 4000);
    };
    // React 19 vacía el formulario al terminar su acción (aunque haya fallado): se devuelve lo escrito para que no se pierda.
    const onReset = () => {
      if (submittedAt && snapshot && Date.now() - submittedAt < 15000) {
        const s = snapshot;
        setTimeout(() => apply(s), 0);
      }
    };

    if (restoreFirst) {
      try {
        const draft = parseDraft(localStorage.getItem(key), Date.now(), ttlMs);
        if (draft) apply(draft.v);
      } catch {
        /* borrador ilegible: se ignora */
      }
    }

    form.addEventListener("input", onEdit);
    form.addEventListener("change", onEdit);
    form.addEventListener("submit", onSubmit);
    form.addEventListener("reset", onReset);
    return () => {
      clearTimeout(timer);
      form.removeEventListener("input", onEdit);
      form.removeEventListener("change", onEdit);
      form.removeEventListener("submit", onSubmit);
      form.removeEventListener("reset", onReset);
    };
  }, [id, path, scope, ttlMs, restoreFirst, skipKey]);

  return <span ref={marker} hidden aria-hidden="true" />;
}
