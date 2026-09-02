import { globSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `coverage.include` is a whitelist, so a layer it does not name is absent from the report
 * rather than reported as uncovered. It once named `src/contexts/discovery` in every pattern.
 * recruiter-engagement arrived on 2026-08-27 and its files stayed outside the report, so the
 * badge measured 75 of 104 files and nothing announced the other 29.
 */

const repositoryRoot = process.cwd();

/**
 * Stated here rather than read out of `vitest.config.ts`, because a list derived from the
 * configuration under test agrees with it by construction and cannot contradict it.
 */
const measuredLayers = [
  "domain",
  "application",
  "presentation/web/formatters",
  "presentation/web/requests",
] as const;

/**
 * Read as text rather than imported, because `biome.jsonc` forbids a `../` import and the
 * repository's `@` alias only reaches `src`. The neighbouring architecture tests read root
 * configuration the same way.
 */
function coveragePatterns(key: "include" | "exclude"): readonly string[] {
  const config = readFileSync(path.join(repositoryRoot, "vitest.config.ts"), "utf8");
  const coverage = config.slice(config.indexOf("coverage: {")).replaceAll(/\/\/[^\n]*/g, "");
  const block = new RegExp(`${key}:\\s*\\[(?<patterns>[^\\]]*)\\]`).exec(coverage)?.groups
    ?.patterns;
  if (!block) {
    throw new Error(`vitest.config.ts declares no coverage.${key} to check.`);
  }
  const patterns = [...block.matchAll(/"(?<pattern>[^"]+)"/g)].map(
    (match) => match.groups?.pattern ?? "",
  );
  if (patterns.length === 0) {
    throw new Error(`vitest.config.ts declares an empty coverage.${key}.`);
  }
  return patterns;
}

function contexts(): readonly string[] {
  return readdirSync(path.join(repositoryRoot, "src", "contexts"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

/** The report's real scope: what `include` selects, less what `exclude` takes back out. */
function measuredFiles(): ReadonlySet<string> {
  return new Set(
    globSync(coveragePatterns("include"), {
      cwd: repositoryRoot,
      exclude: coveragePatterns("exclude"),
    }),
  );
}

function contextNamedBy(pattern: string): string | undefined {
  const context = /src\/contexts\/(?<context>[^/]+)\//.exec(pattern)?.groups?.context;
  return context === "*" ? undefined : context;
}

describe("coverage scope", () => {
  it("measures every bounded context, not the ones that existed when the list was written", () => {
    const measured = measuredFiles();
    const unmeasured = contexts().flatMap((context) =>
      measuredLayers.flatMap((layer) =>
        globSync(`src/contexts/${context}/${layer}/**/*.ts`, { cwd: repositoryRoot })
          .filter((file) => !file.endsWith(".test.ts"))
          .filter((file) => !measured.has(file)),
      ),
    );

    expect(unmeasured).toEqual([]);
  });

  it("names no single context, so a context added later is measured without editing coverage", () => {
    const named = [...coveragePatterns("include"), ...coveragePatterns("exclude")]
      .map((pattern) => ({ context: contextNamedBy(pattern), pattern }))
      .filter((candidate) => candidate.context !== undefined);

    expect(named).toEqual([]);
  });

  it("finds more than one context, so the checks above cannot pass by measuring nothing", () => {
    expect(contexts().length).toBeGreaterThan(1);
    expect(measuredFiles().size).toBeGreaterThan(50);
  });
});
