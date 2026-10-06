import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Referencia visual de Claude Design (no es código de la app)
    "design/**",
    // Salidas locales de las pruebas E2E (capturas, perfiles de navegador)
    "tests/e2e/.out/**",
  ]),
]);

export default eslintConfig;
