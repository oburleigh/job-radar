import { globSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * `coverage.include` is a whitelist, so a layer it does not name is absent from the report
 * rather than reported as uncovered. It once listed `src/contexts/discovery/...` by name.
 * recruiter-engagement was created a week later and went uncounted for two months, while the
 * badge read 97% of a quarter of the code. Nothing announced what it was not looking at.
 */

const repositoryRoot = process.cwd();
const measuredLayers = ["domain", "application"] as const;

/**
 * Read as text rather than imported, because `biome.jsonc` forbids a `../` import and the
 * repository's `@` alias only reaches `src`. The neighbouring architecture tests read root
 * configuration the same way.
 */
function coverageInclude(): readonly string[] {
  const config = readFileSync(path.join(repositoryRoot, "vitest.config.ts"), "utf8");
  const coverage = config.slice(config.indexOf("coverage: {"));
  const block = /include:\s*\[(?<patterns>[^\]]*)\]/.exec(coverage)?.groups?.patterns;
  if (!block) {
    throw new Error("vitest.config.ts declares no coverage.include to check.");
  }
  const include = [...block.matchAll(/"(?<pattern>[^"]+)"/g)].map(
    (match) => match.groups?.pattern ?? "",
  );
  if (include.length === 0) {
    throw new Error("vitest.config.ts declares an empty coverage.include.");
  }
  return include;
}

function contexts(): readonly string[] {
  return readdirSync(path.join(repositoryRoot, "src", "contexts"), { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function measuredFiles(): ReadonlySet<string> {
  return new Set(
    coverageInclude().flatMap((pattern) => globSync(pattern, { cwd: repositoryRoot })),
  );
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

  it("finds more than one context, so the check above cannot pass by measuring nothing", () => {
    expect(contexts().length).toBeGreaterThan(1);
    expect(measuredFiles().size).toBeGreaterThan(50);
  });
});
