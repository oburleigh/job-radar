import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const routeSource = readFileSync(
  path.resolve(process.cwd(), "src/contexts/discovery/composition/web/routes/discovery-runs.ts"),
  "utf8",
);

describe("discovery run status endpoint", () => {
  it("reaches only reads on the polled GET", () => {
    expect(surfaceMembersUsedBy("loader")).toEqual(["readStatuses"]);
  });

  it("keeps the run lifecycle on the mutating methods", () => {
    expect(surfaceMembersUsedBy("action")).toEqual([]);
  });
});

// The polled endpoint runs every few seconds on three surfaces. A write reachable from its loader is
// a write on a GET, so the members it may name are enumerated rather than the ones it may not.
function surfaceMembersUsedBy(exportName: string): readonly string[] {
  const start = routeSource.indexOf(`export async function ${exportName}(`);
  expect(start, `${exportName} is exported from the route`).toBeGreaterThanOrEqual(0);
  const end = routeSource.indexOf("\n}", start);
  expect(end, `${exportName} body is delimited`).toBeGreaterThan(start);
  const body = routeSource.slice(start, end);
  return [
    ...new Set([...body.matchAll(/discoveryRunsWeb\.(\w+)/g)].map((match) => match[1] as string)),
  ].sort();
}
