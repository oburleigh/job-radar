import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    globalSetup: ["./tests/setup-vitest-database.ts"],
    include: ["src/**/*.test.ts", "tests/architecture/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
