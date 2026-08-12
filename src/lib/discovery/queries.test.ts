import { describe, expect, it } from "vitest";

import { BOARD_DISCOVERY_TITLE, buildBoardDiscoveryQueries, buildQueries } from "./queries";

describe("search query builder", () => {
  it("creates one query per title and source without losing locations", () => {
    const queries = buildQueries(
      {
        titleTerms: [
          "Head of Engineering",
          "VP Engineering",
          "Director of Engineering",
          "Technology Director",
          "Head of Technology",
        ],
        locationTerms: ["Dubai", "UAE"],
        includeRemote: false,
      },
      [
        { atsType: "ashby", pattern: "jobs.ashbyhq.com" },
        { atsType: "workday", pattern: "myworkdayjobs.com" },
      ],
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
      buildQueries(
        {
          titleTerms: [],
          locationTerms: ["Dubai"],
          includeRemote: false,
        },
        [{ atsType: "ashby", pattern: "jobs.ashbyhq.com" }],
      ),
    ).toEqual([]);
  });

  it("keeps regional and worldwide remote searches separate", () => {
    const queries = buildQueries(
      {
        titleTerms: ["Staff Platform Engineer"],
        locationTerms: ["London", "UK"],
        includeRemote: true,
      },
      [{ atsType: "greenhouse", pattern: "boards.greenhouse.io" }],
      "title",
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
    const queries = buildQueries(
      {
        titleTerms: ["AI Platform Engineer", "Forward Deployed Engineer"],
        locationTerms: ["London"],
        includeRemote: false,
      },
      [{ atsType: "ashby", pattern: "jobs.ashbyhq.com" }],
      "anywhere",
    );

    expect(queries).toHaveLength(2);
    expect(queries[0]?.text).toContain('("AI Platform Engineer")');
    expect(queries[0]?.text).not.toContain("Forward Deployed Engineer");
    expect(queries[1]?.text).toContain('("Forward Deployed Engineer")');
  });

  it("builds one location-led board query per sync source", () => {
    const queries = buildBoardDiscoveryQueries({ locationTerms: ["Dubai", "UAE"] }, [
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
});
