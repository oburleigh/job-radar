import { describe, expect, it, vi } from "vitest";

import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSearchBrief,
  testSourcePlan,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import type { WebSearchClient } from "@/platform/search/web-search-client";

import { createPublicWebResearchSource } from "./public-web-research-source";

describe("public web Research Source", () => {
  it("retains every qualified firm returned within the query budget", async () => {
    const search = vi.fn(async (_request: Parameters<WebSearchClient["search"]>[0]) => ({
      hasMore: false,
      results: [
        {
          snippet:
            "Software engineering recruitment agency hiring across the United Arab Emirates. Meet our recruiter team and global clients.",
          title: "Technology Recruitment Agency Dubai | Discovered",
          url: "https://discovered.ae/technology-recruitment",
        },
        {
          snippet:
            "Jex recruits software engineering teams in the UAE with active jobs and named consultants.",
          title: "Jex - Technology Recruitment UAE",
          url: "https://jex.ae/technology",
        },
        {
          snippet: "A list of recruitment agencies.",
          title: "Top UAE agencies",
          url: "https://directory.example/uae",
        },
      ],
    }));
    const client: WebSearchClient = {
      search,
    };
    const source = createPublicWebResearchSource({
      client,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      providerName: "serper",
    });
    const run = researchRun();
    const reserveRequest = vi.fn(async () => true);

    const firms = await source.findFirms({ reserveRequest, run });

    expect(firms.map((firm) => firm.companyName)).toEqual(["Discovered", "Jex"]);
    expect(firms).toEqual([
      expect.objectContaining({
        rankingSignals: {
          currentMandatesOrActivity: true,
          namedRecruiterOrTeamEvidence: true,
          scaleOrTrackRecord: true,
          targetMarkets: ["United Arab Emirates"],
        },
        websiteUrl: "https://discovered.ae",
      }),
      expect.objectContaining({
        rankingSignals: expect.objectContaining({
          currentMandatesOrActivity: true,
          namedRecruiterOrTeamEvidence: true,
          targetMarkets: ["United Arab Emirates"],
        }),
        websiteUrl: "https://jex.ae",
      }),
    ]);
    expect(firms).toHaveLength(2);
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({
        query: "Software engineering recruitment agency UAE",
      }),
    );
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ query: "Technology recruitment agency UAE" }),
    );
    expect(search.mock.calls.every(([request]) => !request.query.includes('"'))).toBe(true);
    expect(reserveRequest).toHaveBeenCalledTimes(2);
  });

  it("uses an official country-code domain as target-market Evidence", async () => {
    const source = createPublicWebResearchSource({
      client: {
        async search() {
          return {
            hasMore: false,
            results: [
              {
                snippet: "Software engineering recruitment specialists with active hiring.",
                title: "Digital and Technology Talent Solutions | Discovered",
                url: "https://www.discovered.ae/",
              },
            ],
          };
        },
      },
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      providerName: "serper",
    });

    const firms = await source.findFirms({ reserveRequest: async () => true, run: researchRun() });

    expect(firms[0]?.rankingSignals.targetMarkets).toEqual(["United Arab Emirates"]);
  });

  it("does not invent an industry when the source only supports the Specialism", async () => {
    const source = createPublicWebResearchSource({
      client: {
        async search() {
          return {
            hasMore: false,
            results: [
              {
                snippet:
                  "Software engineering recruitment agency hiring across the United Arab Emirates with active jobs.",
                title: "Jex - Recruitment UAE",
                url: "https://jex.ae/technology",
              },
            ],
          };
        },
      },
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      providerName: "serper",
    });

    const firms = await source.findFirms({ reserveRequest: async () => true, run: researchRun() });

    expect(firms[0]?.industries).toEqual([]);
    expect(firms[0]?.specialisms).toEqual(["Software engineering"]);
  });

  it("uses the official website domain when title segments only describe a location", async () => {
    const source = createPublicWebResearchSource({
      client: {
        async search() {
          return {
            hasMore: false,
            results: [
              {
                snippet: "Technology recruitment with active jobs across the UAE.",
                title: "Technology & Digital recruitment - Dubai",
                url: "https://www.robertwalters.ae/expertise/technology.html",
              },
            ],
          };
        },
      },
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      providerName: "serper",
    });

    const firms = await source.findFirms({ reserveRequest: async () => true, run: researchRun() });

    expect(firms[0]?.companyName).toBe("Robertwalters");
  });

  it("searches every qualified firm for publicly indexed recruiter profiles", async () => {
    const queries: string[] = [];
    const client: WebSearchClient = {
      async search(request) {
        queries.push(request.query);
        const firm = request.query.includes("Discovered") ? "Discovered" : "Jex";
        return {
          hasMore: false,
          results: [
            {
              snippet: `${firm} technology recruiter in the United Arab Emirates.`,
              title: `${firm} Recruiter - Technology Recruiter at ${firm} | LinkedIn`,
              url: `https://www.linkedin.com/in/${firm.toLowerCase()}-recruiter`,
            },
          ],
        };
      },
    };
    const source = createPublicWebResearchSource({
      client,
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      providerName: "serper",
    });
    const run = researchRun();
    const firms = [firm("Discovered", "https://discovered.ae"), firm("Jex", "https://jex.ae")];
    const reserveRequest = vi.fn(async () => true);

    const recruiters = await source.findRecruiters({ firms, reserveRequest, run });

    expect(recruiters.map((recruiter) => recruiter.companyName)).toEqual(["Discovered", "Jex"]);
    expect(recruiters.map((recruiter) => recruiter.profileUrl)).toEqual([
      "https://www.linkedin.com/in/discovered-recruiter",
      "https://www.linkedin.com/in/jex-recruiter",
    ]);
    expect(queries).toEqual([
      "site:linkedin.com/in Discovered Software engineering recruiter UAE",
      "site:linkedin.com/in Jex Software engineering recruiter UAE",
    ]);
    expect(reserveRequest).toHaveBeenCalledTimes(2);
  });

  it("searches the first recruiter page for every firm before requesting another page", async () => {
    const requests: Array<{ page: number; query: string }> = [];
    const source = createPublicWebResearchSource({
      client: {
        async search(request) {
          requests.push({ page: request.page, query: request.query });
          return { hasMore: true, results: [] };
        },
      },
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      providerName: "serper",
    });
    const firms = [
      firm("Discovered", "https://discovered.ae"),
      firm("Jex", "https://jex.ae"),
      firm("Hays", "https://hays.ae"),
    ];
    let remaining = 4;

    await source.findRecruiters({
      firms,
      reserveRequest: async () => {
        remaining -= 1;
        return remaining >= 0;
      },
      run: researchRun({ maxPagesPerQuery: 2 }),
    });

    expect(requests.map((request) => [request.page, request.query.split(" ")[1]])).toEqual([
      [1, "Discovered"],
      [1, "Jex"],
      [1, "Hays"],
      [2, "Discovered"],
    ]);
  });

  it("keeps successful results when another query fails and records the Source failure", async () => {
    const failures: unknown[] = [];
    let request = 0;
    const source = createPublicWebResearchSource({
      client: {
        async search() {
          request += 1;
          if (request === 2) throw new Error("Provider request timed out.");
          return {
            hasMore: false,
            results: [
              {
                snippet:
                  "Technology recruitment firm hiring in the UAE with an active recruiter team.",
                title: "Discovered | Technology Recruitment UAE",
                url: "https://discovered.ae",
              },
            ],
          };
        },
      },
      failures: { record: async (failure) => void failures.push(failure) },
      now: () => new Date("2026-08-31T12:00:00.000Z"),
      providerName: "serper",
    });
    const run = researchRun({ firmDiscoveryPhrases: ["technology recruitment", "IT recruitment"] });

    await expect(source.findFirms({ reserveRequest: async () => true, run })).resolves.toHaveLength(
      1,
    );
    expect(failures).toEqual([
      expect.objectContaining({
        adapterId: "public-web-search:serper:v1",
        message: "Provider request timed out.",
        runId: run.id,
        stage: "firms",
      }),
    ]);
  });
});

function researchRun(
  searchOverrides: Partial<NonNullable<(typeof testSourcePlan)["publicSearch"]>> = {},
) {
  const adapterId = "public-web-search:serper:v1";
  const publicSearch = testSourcePlan.publicSearch;
  if (!publicSearch) throw new Error("The test Source plan requires a public search policy.");
  return createResearchRun({
    brief: testSearchBrief({ firmTarget: 1, recruiterTarget: 2 }),
    id: "run-public-web",
    policy: { ...testAdapterPolicy, id: adapterId },
    sourcePlan: {
      ...testSourcePlan,
      entries: testSourcePlan.entries.map((entry) => ({ ...entry, adapterId })),
      publicSearch: { ...publicSearch, ...searchOverrides },
    },
    startedAt: new Date("2026-08-31T10:00:00.000Z"),
  });
}

function firm(companyName: string, websiteUrl: string) {
  return {
    companyName,
    evidence: {
      adapterId: "public-web-search:serper:v1",
      confidence: "high" as const,
      excerpt: `${companyName} evidence.`,
      observedAt: "2026-08-31",
      policyVersion: "1",
      sourceUrl: websiteUrl,
    },
    industries: ["Technology"],
    kind: "firm" as const,
    rankingSignals: {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: true,
      scaleOrTrackRecord: false,
      targetMarkets: ["United Arab Emirates"],
    },
    reason: "Technology recruitment in the UAE.",
    specialisms: ["Software engineering"],
    websiteUrl,
  };
}
