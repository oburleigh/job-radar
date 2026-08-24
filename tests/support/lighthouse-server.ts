import { type ChildProcess, spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import process from "node:process";

const hostname = "127.0.0.1";
const port = 3300;
const fixtureDirectory = mkdtempSync(path.join(tmpdir(), "job-radar-lighthouse-"));
const fixtureEnvironment = createFixtureEnvironment(fixtureDirectory);
let productionServer: ChildProcess | undefined;
let stopping = false;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    void stop(0);
  });
}

try {
  await runPnpm(["db:setup"]);
  productionServer = startPnpm(["start"]);
  await waitForReady(productionServer);
  console.log(`Lighthouse server ready at http://${hostname}:${port}/`);
  productionServer.once("exit", (code) => {
    void stop(code ?? 1);
  });
  productionServer.once("error", (error) => {
    console.error(error);
    void stop(1);
  });
} catch (error) {
  console.error(error);
  await stop(1);
}

function createFixtureEnvironment(directory: string): NodeJS.ProcessEnv {
  const environment: NodeJS.ProcessEnv = {
    ...process.env,
    DB_PATH: path.join(directory, "job-radar.sqlite"),
    DOTENV_CONFIG_PATH: path.join(directory, ".env"),
    HOST: hostname,
    PORT: "3300",
    SERPER_API_KEY: "lighthouse-fixture-key",
  };

  delete environment.BRAVE_SEARCH_API_KEY;
  delete environment.SERPAPI_KEY;
  return environment;
}

function startPnpm(arguments_: string[]): ChildProcess {
  return spawn("pnpm", arguments_, {
    env: fixtureEnvironment,
    stdio: "inherit",
  });
}

async function runPnpm(arguments_: string[]): Promise<void> {
  const child = startPnpm(arguments_);
  const exitCode = await waitForExit(child);
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
  return new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => resolve(code));
  });
}

async function stop(exitCode: number): Promise<void> {
  if (stopping) {
    return;
  }
  stopping = true;

  if (productionServer && productionServer.exitCode === null && !productionServer.killed) {
    productionServer.kill("SIGTERM");
    await waitForExit(productionServer);
  }

  rmSync(fixtureDirectory, { recursive: true, force: true });
  process.exitCode = exitCode;
}
