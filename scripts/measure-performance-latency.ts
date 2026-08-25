import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { z } from "zod";
import { startProductionPerformanceServer } from "~/tests/support/production-performance-server";
import { summarizePerformanceLatency } from "./performance-latency-report";

const executeFile = promisify(execFile);
const reportPath = path.resolve("artifacts/latency/report.json");
const autocannonPath = fileURLToPath(import.meta.resolve("autocannon"));
const connections = 10;
const requestCount = 500;
const sqliteRuns = 100;

const autocannonResultSchema = z.object({
  connections: z.number(),
  errors: z.number(),
  latency: z.object({
    p50: z.number(),
    p97_5: z.number(),
    p99: z.number(),
  }),
  non2xx: z.number(),
  requests: z.object({
    average: z.number(),
    total: z.number(),
  }),
  timeouts: z.number(),
});

const server = await startProductionPerformanceServer({ output: "ignore" });

try {
  process.env.DB_PATH = server.databasePath;
  const { getDashboardData } = await import(
    "@/contexts/discovery/infrastructure/sqlite/read-models/dashboard"
  );

  for (let index = 0; index < 10; index += 1) {
    getDashboardData({ profileId: server.profileId });
  }

  const sqliteSamples = Array.from({ length: sqliteRuns }, () => {
    const startedAt = performance.now();
    getDashboardData({ profileId: server.profileId });
    return roundMilliseconds(performance.now() - startedAt);
  });

  const measuredUrl = new URL(server.url);
  measuredUrl.searchParams.set("profile", String(server.profileId));
  measuredUrl.searchParams.set("provider", "serper");
  const { stdout } = await executeFile(
    process.execPath,
    [
      autocannonPath,
      "--json",
      "--connections",
      String(connections),
      "--amount",
      String(requestCount),
      measuredUrl.href,
    ],
    { maxBuffer: 10 * 1024 * 1024 },
  );
  const result = autocannonResultSchema.parse(JSON.parse(lastOutputLine(stdout)));
  const report = summarizePerformanceLatency({
    fixture: { jobs: 20, profile: "Performance fixture" },
    http: {
      surface: `GET ${measuredUrl.pathname}${measuredUrl.search}`,
      connections: result.connections,
      requests: result.requests.total,
      errors: result.errors,
      timeouts: result.timeouts,
      non2xx: result.non2xx,
      requestsPerSecond: result.requests.average,
      latency: {
        p50: result.latency.p50,
        p97_5: result.latency.p97_5,
        p99: result.latency.p99,
      },
    },
    sqliteSamples,
  });

  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (result.errors + result.timeouts + result.non2xx > 0) {
    throw new Error(
      `HTTP latency run was invalid: ${result.errors} errors, ${result.timeouts} timeouts, ${result.non2xx} non-2xx responses.`,
    );
  }

  process.stdout.write(
    `${JSON.stringify({
      reportPath,
      http: report.http,
      sqlite: {
        surface: report.sqlite.surface,
        runs: report.sqlite.runs,
        latencyMilliseconds: report.sqlite.latencyMilliseconds,
      },
    })}\n`,
  );
} finally {
  await server.stop();
}

function lastOutputLine(output: string): string {
  const line = output.trim().split("\n").at(-1);
  if (!line) {
    throw new Error("Autocannon did not produce a JSON result.");
  }
  return line;
}

function roundMilliseconds(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
