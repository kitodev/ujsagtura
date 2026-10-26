import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// A telefonos alkalmazás tiszta (React Native nélküli) moduljainak tesztjei.
export default defineConfig({
  resolve: {
    alias: {
      "@shared": fileURLToPath(new URL("../lib", import.meta.url)),
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: { include: ["tests/**/*.test.ts"], environment: "node" },
});
