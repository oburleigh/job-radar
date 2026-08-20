import path from "node:path";
import { fileURLToPath } from "node:url";

import { reactRouter } from "@react-router/dev/vite";
import { defineConfig } from "vite";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [reactRouter()],
  publicDir: "src/contexts/discovery/presentation/web/public",
  resolve: {
    alias: {
      "@": path.join(projectRoot, "src"),
    },
  },
  ssr: {
    external: ["better-sqlite3"],
  },
});
