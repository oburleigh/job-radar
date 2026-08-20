import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src");
const contextsRoot = path.join(sourceRoot, "contexts");
const providerModules = ["next", "zod", "drizzle-orm", "better-sqlite3", "node:"];

describe("context boundaries", () => {
  it("keeps business ownership inside bounded contexts", () => {
    for (const repositoryWideLayer of ["application", "domain", "infrastructure", "presentation"]) {
      expect(existsSync(path.join(sourceRoot, repositoryWideLayer)), repositoryWideLayer).toBe(
        false,
      );
    }
  });

  it("keeps every declared context concrete", () => {
    const contexts = readdirSync(contextsRoot, { withFileTypes: true }).filter((entry) =>
      entry.isDirectory(),
    );

    expect(contexts.map((context) => context.name)).toContain("discovery");
    for (const context of contexts) {
      const contextRoot = path.join(contextsRoot, context.name);
      expect(existsSync(path.join(contextRoot, "CONTEXT.md")), context.name).toBe(true);
      for (const role of ["domain", "application", "infrastructure", "presentation"]) {
        expect(sourceFiles(path.join(contextRoot, role)), `${context.name}/${role}`).not.toEqual(
          [],
        );
      }
      expect(existsSync(path.join(contextRoot, "hexagon")), context.name).toBe(false);
      expect(existsSync(path.join(contextRoot, "adapters")), context.name).toBe(false);
    }
  });

  it("keeps domain code inside its provider-free boundary", () => {
    for (const domainRoot of roleDirectories("domain")) {
      for (const file of sourceFiles(domainRoot)) {
        for (const specifier of importSpecifiers(file)) {
          expect(isProviderModule(specifier), `${relativePath(file)} imports ${specifier}`).toBe(
            false,
          );
          expect(
            isRelativeImportInside(file, specifier, domainRoot),
            `${relativePath(file)} crosses the domain boundary through ${specifier}`,
          ).toBe(true);
        }
      }
    }
  });

  it("keeps application code dependent only on its own application and domain", () => {
    for (const applicationRoot of roleDirectories("application")) {
      const contextRoot = path.dirname(applicationRoot);
      for (const file of sourceFiles(applicationRoot)) {
        for (const specifier of importSpecifiers(file)) {
          expect(isProviderModule(specifier), `${relativePath(file)} imports ${specifier}`).toBe(
            false,
          );
          expect(
            isRelativeImportInside(file, specifier, applicationRoot) ||
              isRelativeImportInside(file, specifier, path.join(contextRoot, "domain")),
            `${relativePath(file)} crosses the application boundary through ${specifier}`,
          ).toBe(true);
        }
      }
    }
  });

  it("keeps infrastructure independent from presentation", () => {
    for (const infrastructureRoot of roleDirectories("infrastructure")) {
      for (const file of sourceFiles(infrastructureRoot)) {
        for (const specifier of importSpecifiers(file)) {
          expect(
            specifier.includes("/presentation/"),
            `${relativePath(file)} imports an outward layer through ${specifier}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps presentation independent from concrete context infrastructure", () => {
    for (const presentationRoot of roleDirectories("presentation")) {
      for (const file of sourceFiles(presentationRoot)) {
        for (const specifier of importSpecifiers(file)) {
          expect(
            specifier.includes("/infrastructure/"),
            `${relativePath(file)} imports a concrete adapter through ${specifier}`,
          ).toBe(false);
        }
      }
    }
  });

  it("keeps test support out of production source", () => {
    for (const file of sourceFiles(sourceRoot)) {
      if (file.includes(`${path.sep}test-support${path.sep}`)) {
        continue;
      }
      for (const specifier of importSpecifiers(file)) {
        expect(
          specifier.includes("/test-support/") || specifier.endsWith("/test-support"),
          `${relativePath(file)} imports test support ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it("keeps shared platform mechanisms independent from contexts", () => {
    const platformRoot = path.join(sourceRoot, "platform");
    if (!existsSync(platformRoot)) {
      return;
    }

    for (const file of sourceFiles(platformRoot)) {
      for (const specifier of importSpecifiers(file)) {
        expect(
          specifier.startsWith("@/contexts/") || specifier.includes("/contexts/"),
          `${relativePath(file)} imports context code through ${specifier}`,
        ).toBe(false);
      }
    }
  });
});

function roleDirectories(role: string): string[] {
  return readdirSync(contextsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(contextsRoot, entry.name, role))
    .filter(existsSync);
}

function sourceFiles(directory: string): string[] {
  if (!existsSync(directory)) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(entryPath);
    }
    return /\.[cm]?[jt]sx?$/.test(entry.name) && !entry.name.includes(".test.") ? [entryPath] : [];
  });
}

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const imports = source.matchAll(
    /\bimport\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g,
  );
  const exports = source.matchAll(
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
  );
  return [...imports, ...exports].map((match) => match[1]).filter((value) => value !== undefined);
}

function isProviderModule(specifier: string): boolean {
  return providerModules.some(
    (provider) => specifier === provider || specifier.startsWith(`${provider}/`),
  );
}

function isRelativeImportInside(file: string, specifier: string, allowedRoot: string): boolean {
  if (!specifier.startsWith(".")) {
    return false;
  }
  const target = path.resolve(path.dirname(file), specifier);
  return target === allowedRoot || target.startsWith(`${allowedRoot}${path.sep}`);
}

function relativePath(file: string): string {
  return path.relative(process.cwd(), file);
}
