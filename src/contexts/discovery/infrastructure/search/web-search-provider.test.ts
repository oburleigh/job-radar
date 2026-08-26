import { describe, expect, it, vi } from "vitest";
import type { SearchLane } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import type {
  SearchProvider,
  SearchProviderFailure,
  SearchRequest,
} from "@/contexts/discovery/application/discovery-runs/ports/search-provider";

import {
  BraveSearchProvider,
  SerpApiSearchProvider,
  SerperSearchProvider,
} from "./web-search-provider";

describe.each([
  ["brave", (fetcher: typeof fetch) => new BraveSearchProvider("test-key", fetcher)],
  ["serpapi", (fetcher: typeof fetch) => new SerpApiSearchProvider("test-key", fetcher)],
  ["serper", (fetcher: typeof fetch) => new SerperSearchProvider("test-key", fetcher)],
] satisfies ReadonlyArray<readonly [string, (fetcher: typeof fetch) => SearchProvider]>)(
  "%s provider failure contract",
  (providerName, createProvider) => {
    it("classifies rate limits with its provider identity", async () => {
      const provider = createProvider(async () => new Response(null, { status: 429 }));

      await expect(execute(provider, "engineering")).rejects.toMatchObject({
        provider: providerName,
        classification: "transient",
        code: "rate-limited",
        attempts: 1,
      } satisfies Partial<SearchProviderFailure>);
    });

    it("classifies malformed successful responses with its provider identity", async () => {
      const provider = createProvider(async () => Response.json({}));

      await expect(execute(provider, "engineering")).rejects.toMatchObject({
        provider: providerName,
        classification: "fatal",
        code: "invalid-response",
        attempts: 1,
      } satisfies Partial<SearchProviderFailure>);
    });
  },
);

describe("Brave search provider", () => {
  it("prepares a rendered request without executing it and receives cancellation at execution", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetcher = vi.fn<typeof fetch>(async (_input, init) => {
      requestSignal = init?.signal ?? undefined;
      return Response.json({ web: { results: [] } });
    });
    const provider = new BraveSearchProvider("test-key", fetcher);
    const prepared = provider.prepare(testLane("engineering leadership"), { count: 20 });

    expect(prepared.renderedQuery).toContain("engineering leadership");
    expect(fetcher).not.toHaveBeenCalled();

    const controller = new AbortController();
    await expect(prepared.execute(controller.signal)).resolves.toEqual({
      results: [],
      hasMore: false,
    });

    expect(fetcher).toHaveBeenCalledOnce();
    expect(requestSignal).toBeDefined();
    controller.abort(new DOMException("Cancelled by user", "AbortError"));
    expect(requestSignal?.aborted).toBe(true);
  });

  it("maps a successful response without web results to an empty list", async () => {
    const provider = new BraveSearchProvider("test-key", async () =>
      Response.json({
        type: "search",
        query: { original: "engineering" },
        mixed: { type: "mixed", main: [] },
      }),
    );

    await expect(execute(provider, "engineering")).resolves.toEqual([]);
  });

  it("maps every web result", async () => {
    const provider = new BraveSearchProvider("test-key", async () =>
      Response.json({
        web: {
          results: [
            {
              title: "Head of Engineering",
              description: "London, United Kingdom",
              url: "https://boards.greenhouse.io/acme/jobs/123",
            },
            {
              title: "Director of Engineering",
              description: "Remote",
              url: "https://jobs.ashbyhq.com/example/456",
            },
          ],
        },
      }),
    );

    await expect(execute(provider, "engineering")).resolves.toEqual([
      {
        title: "Head of Engineering",
        url: "https://boards.greenhouse.io/acme/jobs/123",
        snippet: "London, United Kingdom",
      },
      {
        title: "Director of Engineering",
        url: "https://jobs.ashbyhq.com/example/456",
        snippet: "Remote",
      },
    ]);
  });

  it("rejects malformed result entries at the HTTP boundary", async () => {
    const provider = new BraveSearchProvider("test-key", async () =>
      Response.json({
        web: {
          results: [{ title: "Head of Engineering", url: "not-a-url" }],
        },
      }),
    );

    const failure = await execute(provider, "engineering").catch((error: unknown) => error);

    expect(failure).toMatchObject({
      classification: "fatal",
      code: "invalid-response",
      attempts: 1,
    } satisfies Partial<SearchProviderFailure>);
    expect(failure).toHaveProperty("name", "SearchProviderFailure");
    expect(failure).toHaveProperty("cause", expect.any(Error));
  });

  it.each([
    [401, "fatal", "authentication-rejected"],
    [403, "fatal", "authentication-rejected"],
    [402, "fatal", "payment-required"],
    [429, "transient", "rate-limited"],
    [500, "transient", "server-error"],
    [502, "transient", "server-error"],
    [503, "transient", "server-error"],
    [504, "transient", "server-error"],
    [501, "fatal", "invalid-request"],
    [400, "fatal", "invalid-request"],
  ] as const)("classifies HTTP %i as a %s %s failure", async (status, classification, code) => {
    const provider = new BraveSearchProvider(
      "test-key",
      async () => new Response(null, { status }),
    );

    await expect(execute(provider, "engineering")).rejects.toMatchObject({
      provider: "brave",
      classification,
      code,
      attempts: 1,
    } satisfies Partial<SearchProviderFailure>);
  });

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

    await execute(provider, "site:example.com engineering", {
      count: 20,
      maxAgeDays: 30,
    });

    expect(requestedUrl?.searchParams.get("freshness")).toMatch(
      /^\d{4}-\d{2}-\d{2}to\d{4}-\d{2}-\d{2}$/,
    );
  });

  it("combines a caller cancellation signal with the provider timeout", async () => {
    let requestSignal: AbortSignal | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestSignal = init?.signal as AbortSignal | undefined;
      return Response.json({ web: { results: [] } });
    };
    const provider = new BraveSearchProvider("test-key", fetcher);
    const controller = new AbortController();

    await execute(provider, "engineering", { signal: controller.signal });

    expect(requestSignal).toBeDefined();
    expect(requestSignal).not.toBe(controller.signal);
    controller.abort();
    expect(requestSignal?.aborted).toBe(true);
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

    const results = await execute(
      provider,
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

  it("classifies an exhausted-credit response as fatal", async () => {
    const provider = new SerperSearchProvider("test-key", async () =>
      Response.json({ message: "Not enough credits" }, { status: 400 }),
    );

    await expect(execute(provider, "engineering")).rejects.toMatchObject({
      provider: "serper",
      classification: "fatal",
      code: "credit-exhausted",
      attempts: 1,
    } satisfies Partial<SearchProviderFailure>);
  });
});

function execute(
  provider: SearchProvider,
  query: string,
  request: SearchRequest & { readonly signal?: AbortSignal } = {},
) {
  const { signal, ...preparation } = request;
  return provider
    .prepare(testLane(query), preparation)
    .execute(signal)
    .then((page) => page.results);
}

function testLane(title: string): SearchLane {
  return {
    source: { atsType: "greenhouse", pattern: "boards.greenhouse.io" },
    kind: "role",
    market: {
      scope: { key: "literal:UK", label: "UK", terms: ["UK"] },
      countryCode: null,
      searchLanguage: null,
    },
    titleTerms: [title],
    strategy: "phrase",
  };
}
