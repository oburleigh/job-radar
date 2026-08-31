import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const sourceRoot = path.resolve(process.cwd(), "src");
const contextsRoot = path.join(sourceRoot, "contexts");
const platformRoot = path.join(sourceRoot, "platform");
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
    const contexts = contextDirectories();

    expect(contexts.map((context) => path.basename(context))).toContain("discovery");
    for (const contextRoot of contexts) {
      expect(existsSync(path.join(contextRoot, "CONTEXT.md")), contextRoot).toBe(true);
      for (const role of [
        "domain",
        "application",
        "infrastructure",
        "presentation",
        "composition",
      ]) {
        expect(
          sourceFiles(path.join(contextRoot, role)),
          `${path.basename(contextRoot)}/${role}`,
        ).not.toEqual([]);
      }
      expect(existsSync(path.join(contextRoot, "hexagon")), contextRoot).toBe(false);
      expect(existsSync(path.join(contextRoot, "adapters")), contextRoot).toBe(false);
    }
  });

  it("keeps domain code inside its provider-free boundary", () => {
    for (const domainRoot of roleDirectories("domain")) {
      for (const file of sourceFiles(domainRoot)) {
        assertNoProductionProviderImport(file);
        if (isTestFile(file)) {
          assertInternalImportsStayInside(file, [domainRoot]);
        } else {
          assertAllImportsResolveInside(file, [domainRoot]);
        }
      }
    }
  });

  it("keeps application code dependent only on its application, domain, and test support", () => {
    for (const applicationRoot of roleDirectories("application")) {
      const contextRoot = path.dirname(applicationRoot);
      for (const file of sourceFiles(applicationRoot)) {
        assertNoProductionProviderImport(file);
        if (isTestFile(file)) {
          assertInternalImportsStayInside(file, [
            applicationRoot,
            path.join(contextRoot, "domain"),
            path.join(contextRoot, "test-support"),
          ]);
        } else {
          assertAllImportsResolveInside(file, [applicationRoot, path.join(contextRoot, "domain")]);
        }
      }
    }
  });

  it("keeps recruiter source providers out of the domain and application language", () => {
    const contextRoot = path.join(contextsRoot, "recruiter-engagement");
    for (const role of ["domain", "application"]) {
      for (const file of sourceFiles(path.join(contextRoot, role)).filter(
        (candidate) => !isTestFile(candidate),
      )) {
        const source = readFileSync(file, "utf8");
        expect(source, `${relativePath(file)} contains a concrete recruiter source`).not.toMatch(
          /linkedin|\bmcp\b/i,
        );
      }
    }
  });

  it("keeps infrastructure independent from presentation and composition", () => {
    for (const infrastructureRoot of roleDirectories("infrastructure")) {
      const contextRoot = path.dirname(infrastructureRoot);
      for (const file of sourceFiles(infrastructureRoot)) {
        assertInternalImportsStayInside(file, [
          infrastructureRoot,
          path.join(contextRoot, "application"),
          path.join(contextRoot, "domain"),
          path.join(contextRoot, "test-support"),
          platformRoot,
        ]);
      }
    }
  });

  it("keeps presentation independent from infrastructure and composition", () => {
    for (const presentationRoot of roleDirectories("presentation")) {
      const contextRoot = path.dirname(presentationRoot);
      for (const file of sourceFiles(presentationRoot)) {
        assertInternalImportsStayInside(file, [
          presentationRoot,
          path.join(contextRoot, "application"),
          path.join(contextRoot, "domain"),
          path.join(platformRoot, "http"),
        ]);
      }
    }
  });

  it("uses composition only as the outward wiring layer", () => {
    for (const contextRoot of contextDirectories()) {
      const compositionRoot = path.join(contextRoot, "composition");
      for (const role of ["domain", "application", "infrastructure", "presentation"]) {
        for (const file of sourceFiles(path.join(contextRoot, role))) {
          for (const specifier of importSpecifiers(file)) {
            const target = internalTarget(file, specifier);
            expect(
              target !== null && isInside(target, compositionRoot),
              `${relativePath(file)} imports outward composition through ${specifier}`,
            ).toBe(false);
          }
        }
      }
      for (const file of sourceFiles(compositionRoot)) {
        for (const specifier of importSpecifiers(file)) {
          const target = internalTarget(file, specifier);
          if (target && isInside(target, contextsRoot)) {
            expect(
              isInside(target, contextRoot) || isPublicContextContract(target),
              `${relativePath(file)} wires another context through ${specifier}`,
            ).toBe(true);
          }
        }
      }
    }
  });

  it("keeps production code independent from test support", () => {
    for (const file of sourceFiles(sourceRoot).filter((candidate) => !isTestFile(candidate))) {
      if (file.includes(`${path.sep}test-support${path.sep}`)) {
        continue;
      }
      for (const specifier of importSpecifiers(file)) {
        const target = internalTarget(file, specifier);
        expect(
          target?.includes(`${path.sep}test-support${path.sep}`) ?? false,
          `${relativePath(file)} imports test support through ${specifier}`,
        ).toBe(false);
      }
    }
  });

  it("keeps shared platform mechanisms independent from contexts", () => {
    for (const file of sourceFiles(platformRoot)) {
      for (const specifier of importSpecifiers(file)) {
        const target = internalTarget(file, specifier);
        expect(
          target !== null && isInside(target, contextsRoot),
          `${relativePath(file)} imports context code through ${specifier}`,
        ).toBe(false);
      }
    }
  });
});

function assertNoProductionProviderImport(file: string): void {
  if (isTestFile(file)) {
    return;
  }
  for (const specifier of importSpecifiers(file)) {
    expect(isProviderModule(specifier), `${relativePath(file)} imports ${specifier}`).toBe(false);
  }
}

function assertInternalImportsStayInside(file: string, allowedRoots: readonly string[]): void {
  for (const specifier of importSpecifiers(file)) {
    const target = internalTarget(file, specifier);
    if (!target || !isInside(target, sourceRoot)) {
      continue;
    }
    expect(
      allowedRoots.some((allowedRoot) => isInside(target, allowedRoot)),
      `${relativePath(file)} crosses its boundary through ${specifier}`,
    ).toBe(true);
  }
}

function assertAllImportsResolveInside(file: string, allowedRoots: readonly string[]): void {
  for (const specifier of importSpecifiers(file)) {
    const target = internalTarget(file, specifier);
    expect(
      target !== null && allowedRoots.some((allowedRoot) => isInside(target, allowedRoot)),
      `${relativePath(file)} imports outside its boundary through ${specifier}`,
    ).toBe(true);
  }
}

function contextDirectories(): string[] {
  return readdirSync(contextsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(contextsRoot, entry.name));
}

function roleDirectories(role: string): string[] {
  return contextDirectories()
    .map((contextRoot) => path.join(contextRoot, role))
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
    return /\.[cm]?[jt]sx?$/.test(entry.name) ? [entryPath] : [];
  });
}

function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, "utf8");
  const patterns = [
    /\bimport\s+(?:type\s+)?(?:[^;"']*?\s+from\s+)?["']([^"']+)["']/g,
    /\bexport\s+(?:type\s+)?(?:\*|\{[^}]*\})\s+from\s+["']([^"']+)["']/g,
    /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g,
    /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  return patterns.flatMap((pattern) =>
    [...source.matchAll(pattern)].map((match) => match[1]).filter((value) => value !== undefined),
  );
}

function internalTarget(file: string, specifier: string): string | null {
  if (specifier.startsWith("@/")) {
    return path.resolve(sourceRoot, specifier.slice(2));
  }
  return specifier.startsWith(".") ? path.resolve(path.dirname(file), specifier) : null;
}

function isProviderModule(specifier: string): boolean {
  return providerModules.some(
    (provider) => specifier === provider || specifier.startsWith(`${provider}/`),
  );
}

function isInside(target: string, root: string): boolean {
  return target === root || target.startsWith(`${root}${path.sep}`);
}

function isPublicContextContract(target: string): boolean {
  return [
    path.join(contextsRoot, "discovery", "composition", "configured-market-vocabulary.server"),
    path.join(contextsRoot, "discovery", "public-web-search.server"),
    path.join(contextsRoot, "recruiter-engagement", "public-contract"),
    path.join(contextsRoot, "recruiter-engagement", "public-contract.server"),
  ].includes(target);
}

function isTestFile(file: string): boolean {
  return /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file);
}

function relativePath(file: string): string {
  return path.relative(process.cwd(), file);
}
