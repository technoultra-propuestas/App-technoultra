"use client";

import { useEffect, useRef } from "react";

/**
 * Escena de «Crea tu cuenta» (solo escritorio ≥1024 px): la ilustración sigue el cursor. Técnica (la misma idea de «hero que reacciona al mouse»
 * de las plantillas tipo Neon Logic, pero con capas en lugar de un video): la mirada se mueve con dos capas de iris recortadas por la forma
 * del ojo (así nunca se salen del párpado) y toda la escena se desplaza un poco en sentido contrario al cursor (paralaje). El movimiento
 * se suaviza por fotograma con interpolación; sin movimiento del mouse la mirada «respira» sola; con «reducir movimiento» queda estática.
 */
const SRC_W = 1396; // tamaño de la ilustración (px de origen)
type Eye = { key: "izq" | "der"; box: [number, number, number, number]; c: [number, number] };
const EYES: Eye[] = [
  { key: "izq", box: [757, 305, 65, 46], c: [792, 326] },
  { key: "der", box: [837, 259, 60, 46], c: [872, 279] },
];
const IRIS = 31; // px de origen del sprite del iris
const pct = (v: number, of: number) => `${(v / of) * 100}%`;
const H = 783;

export function GazeStage() {
  const stageRef = useRef<HTMLDivElement>(null);
  const irisRefs = useRef<Record<string, HTMLImageElement | null>>({});

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage || !window.matchMedia("(min-width: 1024px)").matches) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let tx = 1; // objetivo de la mirada (-1 izquierda … 1 derecha); 1 = pose original de la ilustración
    let ty = 0;
    let px = 0; // paralaje objetivo
    let py = 0;
    let cx = tx, cy = ty, cpx = 0, cpy = 0;
    let lastMove = 0;
    let raf = 0;
    let last = performance.now();
    const eyeEl = irisRefs.current.der?.parentElement;

    const onMove = (e: PointerEvent) => {
      lastMove = performance.now();
      const r = eyeEl?.getBoundingClientRect();
      const ex = r ? r.left + r.width / 2 : window.innerWidth * 0.62;
      const ey = r ? r.top + r.height / 2 : window.innerHeight * 0.35;
      tx = Math.max(-1, Math.min(1, (e.clientX - ex) / (window.innerWidth * 0.42)));
      ty = Math.max(-1, Math.min(1, (e.clientY - ey) / (window.innerHeight * 0.45)));
      px = (e.clientX / window.innerWidth - 0.5) * 2;
      py = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", onMove, { passive: true });

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (now - lastMove > 3000) {
        // sin cursor: la mirada vaga despacio entre el formulario y el resto de la pantalla
        const t = now / 1000;
        tx = 0.15 + 0.85 * Math.sin(t * 0.55);
        ty = 0.45 * Math.sin(t * 0.37 + 1);
        px = 0.4 * Math.sin(t * 0.3);
        py = 0.25 * Math.sin(t * 0.23);
      }
      const k = 1 - Math.pow(0.0006, dt); // ~ interpolación exponencial independiente de los fps
      cx += (tx - cx) * k;
      cy += (ty - cy) * k;
      cpx += (px - cpx) * k * 0.6;
      cpy += (py - cpy) * k * 0.6;
      const scale = stage.offsetWidth / SRC_W;
      // el iris de la ilustración original ya está en el extremo derecho del ojo: hacia la derecha casi no hay recorrido
      const dx = (cx < 1 ? (cx - 1) * 9.5 : 0) * scale;
      const dy = (cy < 0 ? cy * 2 : cy * 4) * scale;
      for (const eye of EYES) {
        const el = irisRefs.current[eye.key];
        if (el) el.style.transform = `translate(${dx.toFixed(2)}px, ${dy.toFixed(2)}px)`;
      }
      stage.style.transform = `translate(-50%, -50%) translate(${(-cpx * 10).toFixed(2)}px, ${(-cpy * 6).toFixed(2)}px) scale(1.04)`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("pointermove", onMove);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        ref={stageRef}
        className="absolute left-1/2 top-1/2 will-change-transform"
        style={{ width: "max(100vw, calc(100dvh * 1.7829))", aspectRatio: `${SRC_W} / ${H}`, transform: "translate(-50%, -50%) scale(1.04)" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- ilustración decorativa a medida (capas alineadas al píxel); next/image no admite este montaje */}
        <img src="/registro/escena.webp" alt="" width={SRC_W} height={H} loading="lazy" decoding="async" draggable={false} className="absolute inset-0 h-full w-full select-none" />
        {EYES.map((e) => {
          const [x, y, w, h] = e.box;
          const mask = `url(/registro/ojo-${e.key}-mascara.webp)`;
          return (
            <div
              key={e.key}
              className="absolute"
              style={{ left: pct(x, SRC_W), top: pct(y, H), width: pct(w, SRC_W), height: pct(h, H), WebkitMaskImage: mask, maskImage: mask, WebkitMaskSize: "100% 100%", maskSize: "100% 100%" }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- ver arriba */}
              <img
                ref={(el) => {
                  irisRefs.current[e.key] = el;
                }}
                src={`/registro/iris-${e.key}.webp`}
                alt=""
                width={IRIS}
                height={IRIS}
                loading="lazy"
                decoding="async"
                draggable={false}
                className="absolute select-none will-change-transform"
                style={{ width: pct(IRIS, w), left: pct(e.c[0] - x - IRIS / 2, w), top: pct(e.c[1] - y - IRIS / 2, h), height: pct(IRIS, h) }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
