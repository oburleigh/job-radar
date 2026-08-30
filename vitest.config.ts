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
    globalSetup: ["./tests/support/setup-vitest-database.ts"],
    include: [
      "scripts/**/*.test.ts",
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "packages/**/*.test.ts",
      "packages/**/*.test.tsx",
      "tests/architecture/**/*.test.ts",
      "tests/support/**/*.test.ts",
    ],
    coverage: {
      include: [
        "src/contexts/discovery/domain/**/*.ts",
        "src/contexts/discovery/application/**/*.ts",
        "src/contexts/discovery/presentation/web/{formatters,requests}/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/test-support/**"],
      reporter: ["text", "html"],
      thresholds: {
        statements: 90,
        branches: 80,
        functions: 95,
        lines: 90,
      },
    },
  },
});
