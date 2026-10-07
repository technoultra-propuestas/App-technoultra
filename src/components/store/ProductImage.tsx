"use client";

import { useState } from "react";
import { optimizedImage } from "@/lib/catalog/image";

/** Imagen del producto con carga diferida y respaldo visual si falta o falla (nunca se inventa otra imagen). */
export function ProductImage({ src, alt, width = 480, eager = false, className = "" }: { src: string | null; alt: string; width?: number; eager?: boolean; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <div role="img" aria-label={`${alt} (sin imagen disponible)`} className={`flex items-center justify-center bg-[#EDEDEA] text-muted ${className}`}>
        <svg aria-hidden viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="9" cy="9" r="1.5" />
          <path d="m21 15-5-5L5 21" />
        </svg>
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- Cloudinary ya sirve la imagen optimizada (f_auto,q_auto,w_*)
  return <img src={optimizedImage(src, width)} alt={alt} loading={eager ? "eager" : "lazy"} decoding="async" onError={() => setFailed(true)} className={`bg-white object-contain ${className}`} />;
}
