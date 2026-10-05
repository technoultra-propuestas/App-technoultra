"use client";

/** Último recurso si falla el layout raíz. Sin dependencias del resto de la app. */
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="es-CO">
      <body style={{ margin: 0, background: "#F6F6F5", color: "#121212", fontFamily: "system-ui, sans-serif" }}>
        <main style={{ minHeight: "100dvh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 24, textAlign: "center" }}>
          <h1 style={{ margin: 0, fontSize: 28 }}>Algo salió mal</h1>
          <p style={{ margin: 0, color: "#5C5C59" }}>Inténtalo de nuevo en unos segundos.</p>
          <button onClick={reset} style={{ minHeight: 52, padding: "0 28px", border: 0, borderRadius: 16, background: "#FF8A00", fontWeight: 800, fontSize: 16 }}>
            Reintentar
          </button>
        </main>
      </body>
    </html>
  );
}
