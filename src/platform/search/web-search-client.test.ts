import { describe, expect, it } from "vitest";

import { createWebSearchClient, type WebSearchFailure } from "./web-search-client";

describe("web search client", () => {
  it("executes a Serper request from supplied technical configuration", async () => {
    let requestedBody: Record<string, unknown> | undefined;
    let requestedHeaders: Headers | undefined;
    const client = createWebSearchClient(
      {
        apiKey: "test-key",
        endpoint: "https://google.serper.dev/search",
        label: "Serper.dev",
        maxResults: 10,
        name: "serper",
        parameters: {},
        timeoutMs: 5_000,
      },
      async (_input, init) => {
        requestedBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
        requestedHeaders = new Headers(init?.headers);
        return Response.json({
          organic: [
            {
              link: "https://example.com/team",
              snippet: "Technology recruiters in the UAE.",
              title: "Example Search",
            },
          ],
        });
      },
    );

    await expect(
      client.search({
        count: 20,
        countryCode: "AE",
        page: 2,
        query: "technology recruitment UAE",
        searchLanguage: "en",
      }),
    ).resolves.toEqual({
      hasMore: false,
      results: [
        {
          snippet: "Technology recruiters in the UAE.",
          title: "Example Search",
          url: "https://example.com/team",
        },
      ],
    });
    expect(requestedHeaders?.get("X-API-KEY")).toBe("test-key");
    expect(requestedBody).toMatchObject({
      gl: "ae",
      hl: "en",
      num: 10,
      page: 2,
      q: "technology recruitment UAE",
    });
  });

  it("classifies invalid provider responses without a context dependency", async () => {
    const client = createWebSearchClient(
      {
        apiKey: "test-key",
        endpoint: "https://api.search.brave.com/res/v1/web/search",
        label: "Brave Search",
        maxResults: 20,
        name: "brave",
        parameters: {},
        timeoutMs: 5_000,
      },
      async () => Response.json({}),
    );

    await expect(client.search({ count: 10, page: 1, query: "recruitment" })).rejects.toMatchObject(
      {
        classification: "fatal",
        code: "invalid-response",
        provider: "brave",
      } satisfies Partial<WebSearchFailure>,
    );
  });
});
