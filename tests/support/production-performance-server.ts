import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { seedPerformanceDatabase } from "./seed-performance-database";

const hostname = "127.0.0.1";
const port = 3300;

export interface ProductionPerformanceServer {
  readonly databasePath: string;
  readonly exited: Promise<number>;
  readonly profileId: number;
  readonly url: string;
  stop(): Promise<void>;
}

interface ProductionPerformanceServerOptions {
  readonly output?: "ignore" | "inherit";
}

export async function startProductionPerformanceServer(
  options: ProductionPerformanceServerOptions = {},
): Promise<ProductionPerformanceServer> {
  const fixtureDirectory = mkdtempSync(path.join(tmpdir(), "job-radar-performance-"));
  const databasePath = path.join(fixtureDirectory, "job-radar.sqlite");
  const environment = createFixtureEnvironment(databasePath, fixtureDirectory);
  let productionServer: ChildProcess | undefined;

  try {
    await runPnpm(["db:setup"], environment, options.output);
    const { profileId } = seedPerformanceDatabase(databasePath);
    productionServer = startPnpm(["start"], environment, options.output);
    const exited = observeExit(productionServer);
    await waitForReady(productionServer);

    return {
      databasePath,
      exited,
      profileId,
      url: `http://${hostname}:${port}/`,
      async stop() {
        if (productionServer?.exitCode === null && !productionServer.killed) {
          productionServer.kill("SIGTERM");
          await waitForExit(productionServer);
        }
        rmSync(fixtureDirectory, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (productionServer?.exitCode === null && !productionServer.killed) {
      productionServer.kill("SIGTERM");
      await waitForExit(productionServer);
    }
    rmSync(fixtureDirectory, { recursive: true, force: true });
    throw error;
  }
}

function createFixtureEnvironment(
  databasePath: string,
  fixtureDirectory: string,
): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DB_PATH: databasePath,
    DOTENV_CONFIG_PATH: path.join(fixtureDirectory, ".env"),
    HOST: hostname,
    PORT: String(port),
    SERPER_API_KEY: "performance-fixture-key",
  };

  delete environment.BRAVE_SEARCH_API_KEY;
  delete environment.SERPAPI_KEY;
  return environment;
}

function startPnpm(
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
  output: "ignore" | "inherit" = "inherit",
): ChildProcess {
  return spawn("pnpm", arguments_, {
    env: environment,
    stdio: output,
  });
}

async function runPnpm(
  arguments_: string[],
  environment: NodeJS.ProcessEnv,
  output: "ignore" | "inherit" = "inherit",
): Promise<void> {
  const exitCode = await waitForExit(startPnpm(arguments_, environment, output));
  if (exitCode !== 0) {
    throw new Error(`pnpm ${arguments_.join(" ")} exited with code ${exitCode}.`);
  }
}

async function waitForReady(server: ChildProcess): Promise<void> {
  const timeoutAt = Date.now() + 120_000;
  const url = `http://${hostname}:${port}/`;

  while (Date.now() < timeoutAt) {
    if (server.exitCode !== null) {
      throw new Error(`Production server exited with code ${server.exitCode}.`);
    }

    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // The production server has not bound its port yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  throw new Error(`Production server did not become ready at ${url}.`);
}

function waitForExit(child: ChildProcess): Promise<number | null> {
  if (child.exitCode !== null || child.signalCode !== null) {
    return Promise.resolve(child.exitCode);
  }
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

function observeExit(child: ChildProcess): Promise<number> {
  return new Promise((resolve) => {
    child.once("error", () => resolve(1));
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
