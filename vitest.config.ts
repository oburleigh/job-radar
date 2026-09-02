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
      // Every context's pure layers, not a list of the contexts that existed when this was
      // written. recruiter-engagement was created a week after the original list and went
      // uncounted for two months because nothing here announced what it was not looking at.
      include: [
        "src/contexts/*/domain/**/*.ts",
        "src/contexts/*/application/**/*.ts",
        "src/contexts/*/presentation/web/{formatters,requests}/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/test-support/**"],
      reporter: ["text", "html", "lcov"],
      // A ratchet, set one point under the measurement on the widened scope rather than at
      // the old slack. Coverage is deterministic, so there is no run-to-run noise to absorb:
      // measured 2026-09-02 at 95.96 statements, 89.85 branches, 98.34 functions, 95.95 lines
      // over 104 files.
      thresholds: {
        statements: 95,
        branches: 89,
        functions: 98,
        lines: 95,
      },
    },
  },
});
