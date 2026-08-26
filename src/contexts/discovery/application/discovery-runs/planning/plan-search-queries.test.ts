import { describe, expect, it } from "vitest";

import {
  BOARD_DISCOVERY_TITLE,
  planBoardDiscoveryQueries,
  planSearchQueries,
} from "./plan-search-queries";

const worldwideRemoteTerms = ["remote", "work from anywhere", "anywhere in the world"];

describe("search query planning", () => {
  it("renders every term from the resolved market vocabulary", () => {
    const queries = planSearchQueries(
      {
        titleTerms: ["Head of Engineering"],
        markets: [
          {
            key: "country:AE",
            label: "United Arab Emirates",
            terms: ["United Arab Emirates", "UAE", "Abu Dhabi", "Dubai"],
          },
        ],
        includeRemote: false,
      },
      [{ atsType: "ashby", pattern: "jobs.ashbyhq.com" }],
      "title",
      worldwideRemoteTerms,
    );

    expect(queries[0]?.text).toContain(
      '("United Arab Emirates" OR "UAE" OR "Abu Dhabi" OR "Dubai")',
    );
  });

  it("creates one query per title and source without losing locations", () => {
    const queries = planSearchQueries(
      {
        titleTerms: [
          "Head of Engineering",
          "VP Engineering",
          "Director of Engineering",
          "Technology Director",
          "Head of Technology",
        ],
        markets: literalMarkets(["Dubai", "UAE"]),
        includeRemote: false,
      },
      [
        { atsType: "ashby", pattern: "jobs.ashbyhq.com" },
        { atsType: "workday", pattern: "myworkdayjobs.com" },
      ],
      "title",
      worldwideRemoteTerms,
    );

    expect(queries).toHaveLength(10);
    expect(queries[0]?.text).toContain("site:jobs.ashbyhq.com");
    expect(queries[0]?.text).toContain('intitle:"Head" intitle:"of" intitle:"Engineering"');
    expect(queries[0]?.text).toContain('"Dubai" OR "UAE"');
    expect(queries[0]?.text).not.toContain('"VP Engineering"');
    expect(queries[0]?.titleTerm).toBe("Head of Engineering");
    expect(queries[4]?.titleTerm).toBe("Head of Technology");
  });

  it("returns no queries when a required profile dimension is empty", () => {
    expect(
      planSearchQueries(
        {
          titleTerms: [],
          markets: literalMarkets(["Dubai"]),
          includeRemote: false,
        },
        [{ atsType: "ashby", pattern: "jobs.ashbyhq.com" }],
        "title",
        worldwideRemoteTerms,
      ),
    ).toEqual([]);

    expect(
      planSearchQueries(
        {
          titleTerms: ["Head of Engineering"],
          markets: [],
          includeRemote: false,
        },
        [{ atsType: "ashby", pattern: "jobs.ashbyhq.com" }],
        "title",
        worldwideRemoteTerms,
      ),
    ).toEqual([]);
  });

  it("keeps regional and worldwide remote searches separate", () => {
    const queries = planSearchQueries(
      {
        titleTerms: ["Staff Platform Engineer"],
        markets: literalMarkets(["London", "UK"]),
        includeRemote: true,
      },
      [{ atsType: "greenhouse", pattern: "boards.greenhouse.io" }],
      "title",
      worldwideRemoteTerms,
    );

    expect(queries).toHaveLength(2);
    expect(queries[0]?.text).toContain('("London" OR "UK")');
    expect(queries[0]?.text).not.toContain('"remote"');
    expect(queries[1]).toMatchObject({
      titleTerm: "Staff Platform Engineer (worldwide remote)",
    });
    expect(queries[1]?.text).toContain(
      '("remote" OR "work from anywhere" OR "anywhere in the world")',
    );
  });

  it("keeps titles separate when searching page content", () => {
    const queries = planSearchQueries(
      {
        titleTerms: ["AI Platform Engineer", "Forward Deployed Engineer"],
        markets: literalMarkets(["London"]),
        includeRemote: false,
      },
      [{ atsType: "ashby", pattern: "jobs.ashbyhq.com" }],
      "anywhere",
      worldwideRemoteTerms,
    );

    expect(queries).toEqual([
      {
        atsType: "ashby",
        sourcePattern: "jobs.ashbyhq.com",
        titleTerm: "AI Platform Engineer",
        text: 'site:jobs.ashbyhq.com ("AI Platform Engineer") ("London")',
      },
      {
        atsType: "ashby",
        sourcePattern: "jobs.ashbyhq.com",
        titleTerm: "Forward Deployed Engineer",
        text: 'site:jobs.ashbyhq.com ("Forward Deployed Engineer") ("London")',
      },
    ]);
  });

  it("normalizes surrounding whitespace, embedded quotes, blanks, and duplicate terms", () => {
    const queries = planSearchQueries(
      {
        titleTerms: ['  Staff "Platform"   Engineer  ', 'Staff "Platform"   Engineer'],
        markets: literalMarkets([" London ", "", "London", 'UK"']),
        includeRemote: false,
      },
      [{ atsType: "greenhouse", pattern: "boards.greenhouse.io" }],
      "title",
      worldwideRemoteTerms,
    );

    expect(queries).toEqual([
      {
        atsType: "greenhouse",
        sourcePattern: "boards.greenhouse.io",
        titleTerm: 'Staff "Platform"   Engineer',
        text: 'site:boards.greenhouse.io (intitle:"Staff" intitle:"Platform" intitle:"Engineer") ("London" OR "UK")',
      },
    ]);
  });

  it("keeps one allocation for each title when worldwide remote queries are enabled", () => {
    const queries = planSearchQueries(
      {
        titleTerms: ["Platform Engineer", "Security Engineer"],
        markets: literalMarkets(["London"]),
        includeRemote: true,
      },
      [{ atsType: "ashby", pattern: "jobs.ashbyhq.com" }],
      "title",
      ["remote"],
    );

    expect(queries.map(({ titleTerm, text }) => ({ titleTerm, text }))).toEqual([
      {
        titleTerm: "Platform Engineer",
        text: 'site:jobs.ashbyhq.com (intitle:"Platform" intitle:"Engineer") ("London")',
      },
      {
        titleTerm: "Platform Engineer (worldwide remote)",
        text: 'site:jobs.ashbyhq.com (intitle:"Platform" intitle:"Engineer") ("remote")',
      },
      {
        titleTerm: "Security Engineer",
        text: 'site:jobs.ashbyhq.com (intitle:"Security" intitle:"Engineer") ("London")',
      },
      {
        titleTerm: "Security Engineer (worldwide remote)",
        text: 'site:jobs.ashbyhq.com (intitle:"Security" intitle:"Engineer") ("remote")',
      },
    ]);
  });

  it("builds one location-led board query per sync source", () => {
    const queries = planBoardDiscoveryQueries({ markets: literalMarkets(["Dubai", "UAE"]) }, [
      { atsType: "ashby", pattern: "jobs.ashbyhq.com" },
      { atsType: "greenhouse", pattern: "boards.greenhouse.io" },
    ]);

    expect(queries).toEqual([
      {
        atsType: "ashby",
        sourcePattern: "jobs.ashbyhq.com",
        titleTerm: BOARD_DISCOVERY_TITLE,
        text: 'site:jobs.ashbyhq.com ("Dubai" OR "UAE")',
      },
      {
        atsType: "greenhouse",
        sourcePattern: "boards.greenhouse.io",
        titleTerm: BOARD_DISCOVERY_TITLE,
        text: 'site:boards.greenhouse.io ("Dubai" OR "UAE")',
      },
    ]);
  });

  it("returns no board queries without locations and deduplicates repeated sources", () => {
    expect(
      planBoardDiscoveryQueries({ markets: [] }, [
        { atsType: "ashby", pattern: "jobs.ashbyhq.com" },
      ]),
    ).toEqual([]);

    expect(
      planBoardDiscoveryQueries({ markets: literalMarkets([" London ", "London"]) }, [
        { atsType: "ashby", pattern: "jobs.ashbyhq.com" },
        { atsType: "ashby", pattern: "jobs.ashbyhq.com" },
      ]),
    ).toEqual([
      {
        atsType: "ashby",
        sourcePattern: "jobs.ashbyhq.com",
        titleTerm: BOARD_DISCOVERY_TITLE,
        text: 'site:jobs.ashbyhq.com ("London")',
      },
    ]);
  });
});

function literalMarkets(terms: readonly string[]) {
  return terms.map((term, index) => ({
    key: `literal:${index}`,
    label: term,
    terms: [term],
  }));
}
