"use client";

import { useEffect, useRef } from "react";

/**
 * Modelo de «Crea tu cuenta»: su mirada sigue el cursor (escritorio) o el dedo y los campos que se enfocan (móvil). Dos capas de iris,
 * recortadas por la forma real de cada ojo (máscara), se desplazan sobre la ilustración, cuyos ojos ya vienen «vaciados»: el iris nunca se
 * sale del párpado. Además la modelo flota y se inclina levemente hacia el cursor (paralaje). Todo se interpola por fotograma; sin cursor la
 * mirada vaga sola; con «reducir movimiento» queda estática.
 */
const W = 1431; // tamaño de la ilustración (px de origen)
const H = 1099;
type Eye = { key: "izq" | "der"; box: [number, number, number, number]; c: [number, number]; R: number };
const EYES: Eye[] = [
  { key: "izq", box: [560, 360, 140, 100], c: [650, 411], R: 24 },
  { key: "der", box: [715, 280, 140, 95], c: [791, 321], R: 23 },
];
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

export function GazeStage({ variant = "desktop" }: { variant?: "desktop" | "mobile" }) {
  const mobile = variant === "mobile";
  const wrapRef = useRef<HTMLDivElement>(null);
  const irisRefs = useRef<Record<string, HTMLImageElement | null>>({});

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || window.matchMedia("(min-width: 1024px)").matches === mobile) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Pose original de la ilustración: mira arriba a la derecha (tx = 1). Hacia la izquierda hay más recorrido que hacia la derecha.
    let tx = 1, ty = 0, px = 0, py = 0;
    let cx = tx, cy = ty, cpx = 0, cpy = 0;
    let lastMove = 0;
    let raf = 0;
    let last = performance.now();
    const anchor = irisRefs.current.der?.parentElement;

    const aim = (clientX: number, clientY: number) => {
      lastMove = performance.now();
      const r = anchor?.getBoundingClientRect();
      const ex = r ? r.left + r.width / 2 : window.innerWidth * 0.6;
      const ey = r ? r.top + r.height / 2 : window.innerHeight * 0.35;
      tx = Math.max(-1, Math.min(1, (clientX - ex) / (window.innerWidth * 0.4)));
      ty = Math.max(-1, Math.min(1, (clientY - ey) / (window.innerHeight * 0.45)));
      px = (clientX / window.innerWidth - 0.5) * 2;
      py = (clientY / window.innerHeight - 0.5) * 2;
    };
    const onMove = (e: PointerEvent) => aim(e.clientX, e.clientY);
    const onFocus = (e: FocusEvent) => {
      // móvil: al enfocar un campo la mirada baja hacia él
      const t = e.target as HTMLElement | null;
      const b = t?.getBoundingClientRect();
      if (b) aim(b.left + b.width / 2, b.top + b.height / 2);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    if (mobile) document.addEventListener("focusin", onFocus);

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now - lastMove > 3000) {
        const t = now / 1000;
        tx = 0.1 + 0.9 * Math.sin(t * 0.55);
        ty = 0.5 * Math.sin(t * 0.37 + 1);
        px = 0.4 * Math.sin(t * 0.3);
        py = 0.25 * Math.sin(t * 0.23);
      }
      const k = 1 - Math.pow(0.0006, dt);
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      cpx += (px - cpx) * k * 0.6;
      cpy += (py - cpy) * k * 0.6;
      const scale = wrap.offsetWidth / W;
      const dx = (cx < 1 ? (cx - 1) * 9.5 : 0) * scale; // hasta ~9 px de origen a la izquierda
      const dy = (cy < 0 ? cy * 3 : cy * 5) * scale;
      for (const e of EYES) {
        const el = irisRefs.current[e.key];
        if (el) el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      }
      wrap.style.transform = `translate(${(cpx * 8).toFixed(2)}px, ${(cpy * 5).toFixed(2)}px) rotate(${(cpx * 0.8).toFixed(2)}deg)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("focusin", onFocus);
    };
  }, [mobile]);

  return (
    <div aria-hidden className="pointer-events-none">
      <div className="animate-[tu-float_6s_ease-in-out_infinite]">
        <div ref={wrapRef} className="relative will-change-transform" style={{ aspectRatio: `${W} / ${H}` }}>
          {/* eslint-disable-next-line @next/next/no-img-element -- ilustración decorativa a medida (capas alineadas al píxel); next/image no admite este montaje */}
          <img src="/registro/modelo.webp" alt="" width={W} height={H} loading="eager" fetchPriority="high" decoding="async" draggable={false} className="absolute inset-0 h-full w-full select-none" />
          {EYES.map((e) => {
            const [x, y, w, h] = e.box;
            const mask = `url(/registro/ojo-${e.key}-mascara.webp)`;
            const d = e.R * 2 + 1;
            return (
              <div key={e.key} className="absolute" style={{ left: pct(x, W), top: pct(y, H), width: pct(w, W), height: pct(h, H), WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- ver arriba */}
                <img
                  ref={(el) => {
                    irisRefs.current[e.key] = el;
                  }}
                  src={`/registro/iris-${e.key}.webp`}
                  alt=""
                  width={d}
                  height={d}
                  loading="eager"
                  decoding="async"
                  draggable={false}
                  className="absolute select-none will-change-transform"
                  style={{ width: pct(d, w), height: pct(d, h), left: pct(e.c[0] - x - d / 2, w), top: pct(e.c[1] - y - d / 2, h) }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

