import { describe, expect, it } from "vitest";

import type { SearchLane } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";

import {
  BraveSearchProvider,
  JsonSearchProvider,
  renderSearchLane,
  SerpApiSearchProvider,
  SerperSearchProvider,
} from "./web-search-provider";

const roleLane = {
  source: { atsType: "ashby", pattern: "jobs.ashbyhq.com" },
  kind: "role",
  market: {
    scope: { key: "subdivision:AE-DU", label: "Dubai", terms: ["Dubai"] },
    countryCode: "AE",
    searchLanguage: "en",
  },
  titleTerms: ["Head of Engineering", "VP Engineering"],
  strategy: "role-first",
} as const satisfies SearchLane;

describe("market-aware search providers", () => {
  it("renders all four role strategies as distinct queries in lane order", () => {
    const strategies = ["role-first", "location-first", "phrase", "relaxed-title"] as const;

    const rendered = strategies.map((strategy) => renderSearchLane({ ...roleLane, strategy }));

    expect(rendered).toEqual([
      'site:jobs.ashbyhq.com ((intitle:"Head" intitle:"of" intitle:"Engineering") OR (intitle:"VP" intitle:"Engineering")) ("Dubai")',
      'site:jobs.ashbyhq.com ("Dubai") ((intitle:"Head" intitle:"of" intitle:"Engineering") OR (intitle:"VP" intitle:"Engineering"))',
      'site:jobs.ashbyhq.com ("Head of Engineering" OR "VP Engineering") ("Dubai")',
      'site:jobs.ashbyhq.com ((Head of Engineering) OR (VP Engineering)) ("Dubai")',
    ]);
    expect(new Set(rendered)).toHaveProperty("size", 4);
  });

  it("maps Brave geography, language, zero-based offset, and explicit continuation", async () => {
    let requestedUrl: URL | undefined;
    const provider = new BraveSearchProvider("test-key", async (input) => {
      requestedUrl = new URL(String(input));
      return Response.json({
        query: { more_results_available: true },
        web: { results: [{ title: "Role", url: "https://example.com/role" }] },
      });
    });

    const prepared = provider.prepare(roleLane, { page: 2, count: 3 });
    const page = await prepared.execute(new AbortController().signal);

    expect(prepared.renderedQuery).toBe(
      'site:jobs.ashbyhq.com ((intitle:"Head" intitle:"of" intitle:"Engineering") OR (intitle:"VP" intitle:"Engineering")) ("Dubai")',
    );
    expect(Object.fromEntries(requestedUrl?.searchParams ?? [])).toMatchObject({
      q: prepared.renderedQuery,
      count: "3",
      country: "AE",
      search_lang: "en",
      ui_lang: "en-AE",
      offset: "1",
    });
    expect(page).toEqual({
      results: [{ title: "Role", url: "https://example.com/role", snippet: "" }],
      hasMore: true,
    });
  });

  it("maps SerpAPI configured location, country, language, start, and next-page evidence", async () => {
    let requestedUrl: URL | undefined;
    const provider = new SerpApiSearchProvider("test-key", async (input) => {
      requestedUrl = new URL(String(input));
      return Response.json({
        organic_results: [],
        serpapi_pagination: { next: "https://serpapi.com/search.json?start=10" },
      });
    });

    const page = await provider
      .prepare({ ...roleLane, strategy: "location-first" }, { page: 3, count: 5 })
      .execute(new AbortController().signal);

    expect(Object.fromEntries(requestedUrl?.searchParams ?? [])).toMatchObject({
      location: "Dubai, United Arab Emirates",
      gl: "ae",
      hl: "en",
      start: "10",
      num: "5",
    });
    expect(page.hasMore).toBe(true);
  });

  it("maps Serper country, language, and current one-based page field", async () => {
    let body: Record<string, unknown> | undefined;
    const provider = new SerperSearchProvider("test-key", async (_input, init) => {
      body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return Response.json({ organic: googleResults(7), hasMore: false });
    });

    const page = await provider
      .prepare({ ...roleLane, strategy: "phrase" }, { page: 4, count: 7 })
      .execute(new AbortController().signal);

    expect(body).toMatchObject({ gl: "ae", hl: "en", page: 4, num: 7 });
    expect(page.hasMore).toBe(false);
  });

  it("omits a provider location when that market is not configured", async () => {
    let serpApiUrl: URL | undefined;
    const unconfiguredLane: SearchLane = {
      ...roleLane,
      market: {
        scope: { key: "city:GB:london", label: "London", terms: ["London"] },
        countryCode: "GB",
        searchLanguage: "en",
      },
    };
    const provider = new SerpApiSearchProvider("test-key", async (input) => {
      serpApiUrl = new URL(String(input));
      return Response.json({ organic_results: [] });
    });

    await provider
      .prepare(unconfiguredLane, { page: 1, count: 2 })
      .execute(new AbortController().signal);

    expect(serpApiUrl?.searchParams.has("location")).toBe(false);
    expect(serpApiUrl?.searchParams.get("gl")).toBe("gb");
  });

  it.each([
    [
      "brave",
      () =>
        new BraveSearchProvider("test-key", async () =>
          Response.json({ web: { results: braveResults(2) } }),
        ),
    ],
    [
      "serpapi",
      () =>
        new SerpApiSearchProvider("test-key", async () =>
          Response.json({ organic_results: googleResults(2) }),
        ),
    ],
    [
      "serper",
      () =>
        new SerperSearchProvider("test-key", async () =>
          Response.json({ organic: googleResults(2) }),
        ),
    ],
  ] as const)("falls back to a full requested page for %s continuation", async (_name, create) => {
    const page = await create()
      .prepare(roleLane, { page: 1, count: 2 })
      .execute(new AbortController().signal);

    expect(page.hasMore).toBe(true);
  });

  it("uses the same continuation fallback in the fixture provider", async () => {
    const provider = new JsonSearchProvider([
      { title: "One", url: "https://example.com/1", snippet: "" },
      { title: "Two", url: "https://example.com/2", snippet: "" },
    ]);

    await expect(
      provider.prepare(roleLane, { page: 1, count: 2 }).execute(new AbortController().signal),
    ).resolves.toMatchObject({ hasMore: true });
  });
});

function braveResults(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Role ${index}`,
    url: `https://example.com/brave/${index}`,
  }));
}

function googleResults(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    title: `Role ${index}`,
    link: `https://example.com/google/${index}`,
  }));
}
