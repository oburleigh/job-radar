import "dotenv/config";

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER_KEYS = ["BRAVE_SEARCH_API_KEY", "SERPAPI_KEY", "SERPER_API_KEY"] as const;
export const SUPPORTED_NODE_MAJOR = 24;
export const SUPPORTED_PNPM_MAJOR = 11;

interface SetupPrerequisites {
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly environmentFileExists: boolean;
  readonly providerKeys: Readonly<Record<(typeof PROVIDER_KEYS)[number], string | undefined>>;
}

interface SetupPrerequisiteOptions {
  readonly requireProviderKey?: boolean;
}

export function setupPrerequisiteErrors(
  prerequisites: SetupPrerequisites,
  options: SetupPrerequisiteOptions = {},
): string[] {
  const errors: string[] = [];

  if (majorVersion(prerequisites.nodeVersion) !== SUPPORTED_NODE_MAJOR) {
    errors.push(
      `Job Radar requires Node.js ${SUPPORTED_NODE_MAJOR}.x; found ${prerequisites.nodeVersion}.`,
    );
  }
  if (majorVersion(prerequisites.pnpmVersion) !== SUPPORTED_PNPM_MAJOR) {
    errors.push(
      `Job Radar requires pnpm ${SUPPORTED_PNPM_MAJOR}.x through Corepack; found ${prerequisites.pnpmVersion || "an unknown version"}.`,
    );
  }

  if (options.requireProviderKey !== false) {
    const hasProviderKey = PROVIDER_KEYS.some((key) =>
      Boolean(prerequisites.providerKeys[key]?.trim()),
    );
    if (!prerequisites.environmentFileExists && !hasProviderKey) {
      errors.push("Copy .env.example to .env before setup.");
    }
    if (!hasProviderKey) {
      errors.push(
        "Add one search provider key to .env: BRAVE_SEARCH_API_KEY, SERPAPI_KEY, or SERPER_API_KEY.",
      );
    }
  }

  return errors;
}

function majorVersion(version: string): number {
  return Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
}

function pnpmVersion(userAgent: string | undefined): string {
  return /(?:^|\s)pnpm\/([^\s]+)/.exec(userAgent ?? "")?.[1] ?? "";
}

function checkCurrentSetup(): void {
  const databaseOnly = process.argv.includes("--database-only");
  const errors = setupPrerequisiteErrors(
    {
      nodeVersion: process.versions.node,
      pnpmVersion: pnpmVersion(process.env.npm_config_user_agent),
      environmentFileExists: existsSync(path.resolve(process.cwd(), ".env")),
      providerKeys: Object.fromEntries(
        PROVIDER_KEYS.map((key) => [key, process.env[key]]),
      ) as SetupPrerequisites["providerKeys"],
    },
    { requireProviderKey: !databaseOnly },
  );

  if (errors.length > 0) {
    console.error(
      [
        "Job Radar setup prerequisites are not satisfied:",
        ...errors.map((error) => `- ${error}`),
      ].join("\n"),
    );
    process.exitCode = 1;
    return;
  }

  const requirements = databaseOnly
    ? `Node.js ${SUPPORTED_NODE_MAJOR}, pnpm ${SUPPORTED_PNPM_MAJOR}`
    : `Node.js ${SUPPORTED_NODE_MAJOR}, pnpm ${SUPPORTED_PNPM_MAJOR}, provider key`;
  console.log(`Job Radar setup prerequisites are ready (${requirements}).`);
}

const entryPoint = process.argv[1];
if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  checkCurrentSetup();
}
