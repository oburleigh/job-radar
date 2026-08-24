import "dotenv/config";

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROVIDER_KEYS = ["BRAVE_SEARCH_API_KEY", "SERPAPI_KEY", "SERPER_API_KEY"] as const;

interface SetupPrerequisites {
  readonly nodeVersion: string;
  readonly pnpmVersion: string;
  readonly environmentFileExists: boolean;
  readonly providerKeys: Readonly<Record<(typeof PROVIDER_KEYS)[number], string | undefined>>;
}

export function setupPrerequisiteErrors(prerequisites: SetupPrerequisites): string[] {
  const errors: string[] = [];

  if (majorVersion(prerequisites.nodeVersion) !== 24) {
    errors.push(`Job Radar requires Node.js 24.x; found ${prerequisites.nodeVersion}.`);
  }
  if (majorVersion(prerequisites.pnpmVersion) !== 11) {
    errors.push(
      `Job Radar requires pnpm 11.x through Corepack; found ${prerequisites.pnpmVersion || "an unknown version"}.`,
    );
  }

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

  return errors;
}

function majorVersion(version: string): number {
  return Number.parseInt(version.replace(/^v/, "").split(".")[0] ?? "", 10);
}

function pnpmVersion(userAgent: string | undefined): string {
  return /(?:^|\s)pnpm\/([^\s]+)/.exec(userAgent ?? "")?.[1] ?? "";
}

function checkCurrentSetup(): void {
  const errors = setupPrerequisiteErrors({
    nodeVersion: process.versions.node,
    pnpmVersion: pnpmVersion(process.env.npm_config_user_agent),
    environmentFileExists: existsSync(path.resolve(process.cwd(), ".env")),
    providerKeys: Object.fromEntries(
      PROVIDER_KEYS.map((key) => [key, process.env[key]]),
    ) as SetupPrerequisites["providerKeys"],
  });

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

  console.log("Job Radar setup prerequisites are ready (Node.js 24, pnpm 11, provider key).");
}

const entryPoint = process.argv[1];
if (entryPoint && path.resolve(entryPoint) === fileURLToPath(import.meta.url)) {
  checkCurrentSetup();
}
