import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src");
const contextsRoot = path.join(sourceRoot, "contexts");
const serverOnlyModules = ["zod", "drizzle-orm", "better-sqlite3", "node:"];
const moduleExtensions = [".ts", ".tsx"];

describe("client payload isolation", () => {
  it("names every client-facing context contract", () => {
    expect(clientFacingContracts().map(relativePath)).toEqual([
      "src/contexts/recruiter-engagement/public-contract.ts",
    ]);
  });

  it("keeps server-only packages out of every client-facing context contract", () => {
    for (const contract of clientFacingContracts()) {
      expect(serverOnlyReach(contract), relativePath(contract)).toBeNull();
    }
  });
});

// A contract another context imports for client components ships to the browser whole: React Router
// strips server route exports, not the barrel that supplied them. Server-only code therefore belongs
// behind a `.server` contract, which the client graph never resolves.
function clientFacingContracts(): readonly string[] {
  return readdirSync(contextsRoot)
    .map((entry) => path.join(contextsRoot, entry))
    .filter((entry) => statSync(entry).isDirectory())
    .flatMap((contextRoot) =>
      readdirSync(contextRoot)
        .map((entry) => path.join(contextRoot, entry))
        .filter((entry) => statSync(entry).isFile() && isClientFacingContract(entry)),
    )
    .sort();
}

function isClientFacingContract(file: string): boolean {
  return (
    moduleExtensions.includes(path.extname(file)) && !isServerModule(file) && !isTestFile(file)
  );
}

function serverOnlyReach(contract: string): string | null {
  const origin = new Map<string, string | null>([[contract, null]]);
  const pending = [contract];

  while (pending.length > 0) {
    const file = pending.shift() as string;
    for (const specifier of importSpecifiers(readFileSync(file, "utf8"))) {
      if (isServerOnlyModule(specifier)) {
        return `${importChain(origin, file)} imports ${specifier}`;
      }
      const target = resolveInternalModule(file, specifier);
      if (target === null || isServerModule(target) || origin.has(target)) continue;
      origin.set(target, file);
      pending.push(target);
    }
  }
  return null;
}

function importChain(origin: ReadonlyMap<string, string | null>, file: string): string {
  const chain = [file];
  for (let parent = origin.get(file); parent != null; parent = origin.get(parent)) {
    chain.unshift(parent);
  }
  return chain.map(relativePath).join(" -> ");
}

function importSpecifiers(source: string): readonly string[] {
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\bimport\s+["']([^"']+)["']/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]).filter((value) => value !== undefined),
  );
}

function resolveInternalModule(file: string, specifier: string): string | null {
  const base = specifier.startsWith("@/")
    ? path.resolve(sourceRoot, specifier.slice(2))
    : specifier.startsWith(".")
      ? path.resolve(path.dirname(file), specifier)
      : null;
  if (base === null) return null;

  for (const candidate of [
    ...moduleExtensions.map((extension) => `${base}${extension}`),
    ...moduleExtensions.map((extension) => path.join(base, `index${extension}`)),
    base,
  ]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function isServerOnlyModule(specifier: string): boolean {
  return serverOnlyModules.some((module) =>
    module.endsWith(":")
      ? specifier.startsWith(module)
      : specifier === module || specifier.startsWith(`${module}/`),
  );
}

function isServerModule(file: string): boolean {
  return /\.server\.[cm]?[jt]sx?$/.test(file);
}

function isTestFile(file: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function relativePath(file: string): string {
  return path.relative(process.cwd(), file);
}
