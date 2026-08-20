import { describe, expect, it } from "vitest";

import { BraveSearchProvider, SerperSearchProvider } from "./web-search-provider";

describe("Brave search provider", () => {
  it("applies the profile age window as a freshness filter", async () => {
    let requestedUrl: URL | undefined;
    const fetcher: typeof fetch = async (input) => {
      requestedUrl = new URL(String(input));
      return new Response(JSON.stringify({ web: { results: [] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };
    const provider = new BraveSearchProvider("test-key", fetcher);

    await provider.search("site:example.com engineering", {
      count: 20,
      maxAgeDays: 30,
    });

    expect(requestedUrl?.searchParams.get("freshness")).toMatch(
      /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/,
    );
  });
});

describe("Serper.dev search provider", () => {
  it("posts the query and maps organic results", async () => {
    let requestedBody: Record<string, unknown> | undefined;
    let requestedHeaders: Headers | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requestedHeaders = new Headers(init?.headers);
      return new Response(
        JSON.stringify({
          organic: [
            {
              title: "Head of Engineering",
              link: "https://boards.greenhouse.io/acme/jobs/123",
              snippet: "London, United Kingdom",
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    };
    const provider = new SerperSearchProvider("test-key", fetcher);

    const results = await provider.search(
      'site:boards.greenhouse.io intitle:"Head of Engineering" "UK"',
      { count: 20, maxAgeDays: 30 },
    );

    expect(requestedHeaders?.get("X-API-KEY")).toBe("test-key");
    expect(requestedBody?.num).toBe(10);
    expect(requestedBody?.q).toContain("boards.greenhouse.io");
    expect(requestedBody?.tbs).toBe("qdr:m");
    expect(results).toEqual([
      {
        title: "Head of Engineering",
        url: "https://boards.greenhouse.io/acme/jobs/123",
        snippet: "London, United Kingdom",
      },
    ]);
  });
});
