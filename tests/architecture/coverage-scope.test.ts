import { globSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { describe, expect, it } from "vitest";
import type { ViteUserConfig } from "vitest/config";

/**
 * `coverage.include` is a whitelist, so a layer it does not name is absent from the report
 * rather than reported as uncovered. It once named `src/contexts/discovery` in every pattern.
 * recruiter-engagement arrived on 2026-08-27 and its files stayed outside the report, so by
 * the time the badge was added the report measured 75 of 104 files and announced neither the
 * number nor the 29 it was not looking at.
 */

const repositoryRoot = process.cwd();

/**
 * Stated here rather than taken from `vitest.config.ts`, because a list derived from the
 * configuration under test agrees with it by construction and cannot contradict it.
 */
const measuredLayers = [
  "domain",
  "application",
  "presentation/web/formatters",
  "presentation/web/requests",
] as const;

/**
 * Evaluated rather than read as text. A parser cannot resolve a pattern held in a variable,
 * and cannot see the options that narrow the report without touching a pattern at all.
 */
/** Vitest reads `changed` from the config file, though `TestUserConfig` does not declare it. */
type DeclaredTest = NonNullable<ViteUserConfig["test"]> & { readonly changed?: string | boolean };

async function declaredTest() {
  const module = (await import(
    pathToFileURL(path.join(repositoryRoot, "vitest.config.ts")).href
  )) as { readonly default: { readonly test?: DeclaredTest } };
  const declared = module.default.test;
  if (!declared?.coverage || !("include" in declared.coverage) || !declared.coverage.include) {
    throw new Error("vitest.config.ts declares no coverage.include to check.");
  }
  return { ...declared, coverage: declared.coverage };
}

async function coverage() {
  return (await declaredTest()).coverage;
}

function contexts(): readonly string[] {
  return readdirSync(path.join(repositoryRoot, "src", "contexts"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

async function measuredFiles(): Promise<ReadonlySet<string>> {
  const { exclude, include } = await coverage();
  return new Set(globSync([...(include ?? [])], { cwd: repositoryRoot, exclude }));
}

function contextNamedBy(pattern: string): string | undefined {
  const context = /src\/contexts\/(?<context>[^/]+)\//.exec(pattern)?.groups?.context;
  return context === "*" ? undefined : context;
}

describe("coverage scope", () => {
  it("measures every bounded context, not the ones that existed when the list was written", async () => {
    const measured = await measuredFiles();
    const unmeasured = contexts().flatMap((context) =>
      measuredLayers.flatMap((layer) =>
        globSync(`src/contexts/${context}/${layer}/**/*.ts`, { cwd: repositoryRoot })
          .filter((file) => !file.endsWith(".test.ts"))
          .filter((file) => !measured.has(file)),
      ),
    );

    expect(unmeasured).toEqual([]);
  });

  it("names no single context, so a context added later is measured without editing coverage", async () => {
    const { exclude, include } = await coverage();
    const named = [...(include ?? []), ...(exclude ?? [])]
      .map((pattern) => ({ context: contextNamedBy(pattern), pattern }))
      .filter((candidate) => candidate.context !== undefined);

    expect(named).toEqual([]);
  });

  it("reports the whole scope every run, rather than only what a commit touched", async () => {
    const declared = await declaredTest();

    expect(declared.coverage.changed).toBeUndefined();
    /** `coverage.changed` takes its default from `test.changed`, so this narrows the report too. */
    expect(declared.changed).toBeUndefined();
    /**
     * Stated as the whole command rather than as options to reject. A list of rejected options
     * is a list of the ones thought of, and `--changed` was not one of them.
     */
    expect(
      JSON.parse(readFileSync(path.join(repositoryRoot, "package.json"), "utf8")).scripts[
        "test:coverage"
      ],
    ).toBe("vitest run --coverage");
  });

  it("finds more than one context, so the checks above cannot pass by measuring nothing", async () => {
    expect(contexts().length).toBeGreaterThan(1);
    expect((await measuredFiles()).size).toBeGreaterThan(50);
  });
});
