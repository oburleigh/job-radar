import { describe, expect, it } from "vitest";

import { planSearchLanes } from "./plan-search-lanes";

const market = {
  scope: {
    key: "country:AE",
    label: "United Arab Emirates",
    terms: ["United Arab Emirates", "UAE", "Dubai", "Abu Dhabi"],
  },
  countryCode: "AE",
  searchLanguage: "en",
} as const;

describe("search lane planning", () => {
  it("groups normalized titles within each source, market, and configured strategy", () => {
    const lanes = planSearchLanes(
      {
        titleTerms: [" Head of Engineering ", "VP Engineering", "Head of Engineering"],
        markets: [market],
        includeRemote: false,
      },
      [
        { atsType: "ashby", pattern: "jobs.ashbyhq.com", supportsBoardSync: false },
        { atsType: "greenhouse", pattern: "boards.greenhouse.io", supportsBoardSync: false },
      ],
      ["location-first", "role-first", "phrase", "relaxed-title"],
      ["remote"],
    );

    expect(lanes).toHaveLength(8);
    expect(lanes.map((lane) => `${lane.source.atsType}:${lane.strategy}`)).toEqual([
      "ashby:location-first",
      "ashby:role-first",
      "ashby:phrase",
      "ashby:relaxed-title",
      "greenhouse:location-first",
      "greenhouse:role-first",
      "greenhouse:phrase",
      "greenhouse:relaxed-title",
    ]);
    expect(lanes[0]).toMatchObject({
      kind: "role",
      market,
      titleTerms: ["Head of Engineering", "VP Engineering"],
    });
  });

  it("creates role lanes per market while keeping board and worldwide remote lanes distinct", () => {
    const dubai = {
      scope: { key: "subdivision:AE-DU", label: "Dubai", terms: ["Dubai"] },
      countryCode: "AE",
      searchLanguage: "en",
    } as const;
    const lanes = planSearchLanes(
      {
        titleTerms: ["Platform Engineer"],
        markets: [market, dubai],
        includeRemote: true,
      },
      [{ atsType: "ashby", pattern: "jobs.ashbyhq.com", supportsBoardSync: true }],
      ["role-first", "phrase"],
      ["remote", "work from anywhere"],
    );

    expect(lanes.map(({ kind, strategy, market }) => [kind, strategy, market.scope.key])).toEqual([
      ["role", "role-first", "country:AE"],
      ["role", "phrase", "country:AE"],
      ["role", "role-first", "subdivision:AE-DU"],
      ["role", "phrase", "subdivision:AE-DU"],
      ["worldwide-remote", null, "worldwide-remote"],
      ["board-discovery", null, "country:AE"],
      ["board-discovery", null, "subdivision:AE-DU"],
    ]);
    expect(lanes[4]?.market).toEqual({
      scope: {
        key: "worldwide-remote",
        label: "Worldwide remote",
        terms: ["remote", "work from anywhere"],
      },
      countryCode: null,
      searchLanguage: null,
    });
  });

  it("returns no lanes without normalized titles, markets, sources, or strategies", () => {
    const source = [
      { atsType: "ashby", pattern: "jobs.ashbyhq.com", supportsBoardSync: true },
    ] as const;
    const criteria = { titleTerms: ["Engineer"], markets: [market], includeRemote: false };

    expect(planSearchLanes({ ...criteria, titleTerms: [" "] }, source, ["phrase"], [])).toEqual([]);
    expect(planSearchLanes({ ...criteria, markets: [] }, source, ["phrase"], [])).toEqual([]);
    expect(planSearchLanes(criteria, [], ["phrase"], [])).toEqual([]);
    expect(planSearchLanes(criteria, source, [], [])).toEqual([]);
  });
});
