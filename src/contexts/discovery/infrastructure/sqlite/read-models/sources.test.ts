import { describe, expect, it } from "vitest";

import { sortSourceRegistry } from "./sources";

describe("source registry read model", () => {
  it("orders source names alphabetically and duplicate names by endpoint", () => {
    const sources = sortSourceRegistry(
      [
        { atsType: "greenhouse", id: 8, pattern: "jobs.greenhouse.io" },
        { atsType: "lever", id: 3, pattern: "jobs.lever.co" },
        { atsType: "greenhouse", id: 4, pattern: "boards.greenhouse.io" },
        { atsType: "ashby", id: 2, pattern: "jobs.ashbyhq.com" },
      ] as const,
      { ashby: "Ashby", greenhouse: "Greenhouse", lever: "Lever" },
    );

    expect(sources.map(({ atsType, pattern }) => [atsType, pattern])).toEqual([
      ["ashby", "jobs.ashbyhq.com"],
      ["greenhouse", "boards.greenhouse.io"],
      ["greenhouse", "jobs.greenhouse.io"],
      ["lever", "jobs.lever.co"],
    ]);
  });
});
