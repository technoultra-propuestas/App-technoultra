import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
    },
  },
  // 20 s: las pruebas de base de datos (PGlite) y de PDF cargan módulos pesados; con varias en paralelo, 5 s daba falsos fallos de tiempo.
  test: { environment: "node", include: ["tests/**/*.test.ts", "src/**/*.test.ts"], testTimeout: 20000, hookTimeout: 180000 },
});
