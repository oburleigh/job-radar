import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type Database from "better-sqlite3";
import { createServer, type RunnableDevEnvironment } from "vite";
import { expect, it, vi } from "vitest";

it("releases its SQLite lease across repeated Vite SSR reloads and preserves data", async () => {
  const directory = mkdtempSync(path.join(tmpdir(), "job-radar-client-reload-"));
  vi.stubEnv("DB_PATH", path.join(directory, "preview.sqlite"));
  const server = await createServer({
    configFile: false,
    cacheDir: path.join(directory, "vite-cache"),
    server: { middlewareMode: true, watch: null, hmr: { port: 0 } },
  });
  const environment = server.environments.ssr as RunnableDevEnvironment;
  const clientPath = path.resolve("src/platform/sqlite/client.ts");
  let current: { sqlite: Database.Database; closeDatabase(): void } | undefined;
  try {
    current = await environment.runner.import<{ sqlite: Database.Database; closeDatabase(): void }>(
      clientPath,
    );
    current.sqlite.exec(
      "CREATE TABLE retained (value TEXT); INSERT INTO retained VALUES ('before reload')",
    );
    for (let reload = 0; reload < 2; reload += 1) {
      const previous = current;
      environment.hot.send({ type: "full-reload" });
      await expect.poll(() => previous.sqlite.open, { timeout: 10_000 }).toBe(false);
      current = await environment.runner.import<{
        sqlite: Database.Database;
        closeDatabase(): void;
      }>(clientPath);
      expect(current.sqlite.prepare("SELECT value FROM retained").pluck().get()).toBe(
        "before reload",
      );
    }
  } finally {
    current?.closeDatabase();
    await server.close();
    vi.unstubAllEnvs();
    rmSync(directory, { recursive: true, force: true });
  }
}, 30_000);
