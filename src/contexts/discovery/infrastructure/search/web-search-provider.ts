import type {
  SearchLane,
  SearchStrategy,
} from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import type {
  SearchPage,
  SearchProvider,
  SearchRequest,
  SearchResult,
} from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import { SearchProviderFailure } from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { createWebSearchClient, WebSearchFailure } from "@/platform/search/web-search-client";

export class BraveSearchProvider implements SearchProvider {
  readonly name = "brave";

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey) {
      throw new Error("Brave Search API key is not configured");
    }
  }

  prepare(lane: SearchLane, options: SearchRequest = {}) {
    const query = renderSearchLane(lane);
    return {
      renderedQuery: query,
      execute: (signal?: AbortSignal) =>
        executeWebSearch(this.name, this.apiKey, this.fetcher, lane, query, options, signal),
    };
  }
}

export class SerpApiSearchProvider implements SearchProvider {
  readonly name = "serpapi";

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey) {
      throw new Error("SerpAPI key is not configured");
    }
  }

  prepare(lane: SearchLane, options: SearchRequest = {}) {
    const query = renderSearchLane(lane);
    return {
      renderedQuery: query,
      execute: (signal?: AbortSignal) =>
        executeWebSearch(this.name, this.apiKey, this.fetcher, lane, query, options, signal),
    };
  }
}

export class SerperSearchProvider implements SearchProvider {
  readonly name = "serper";

  constructor(
    private readonly apiKey: string,
    private readonly fetcher: typeof fetch = fetch,
  ) {
    if (!apiKey) {
      throw new Error("Serper.dev API key is not configured");
    }
  }

  prepare(lane: SearchLane, options: SearchRequest = {}) {
    const query = renderSearchLane(lane);
    return {
      renderedQuery: query,
      execute: (signal?: AbortSignal) =>
        executeWebSearch(this.name, this.apiKey, this.fetcher, lane, query, options, signal),
    };
  }
}

export class JsonSearchProvider implements SearchProvider {
  readonly name = "json";

  constructor(private readonly hits: SearchResult[]) {}

  prepare(lane: SearchLane, options: SearchRequest = {}) {
    const query = renderSearchLane(lane);
    return {
      renderedQuery: query,
      execute: async (_signal?: AbortSignal) => {
        const limit = options.count ?? getJobRadarConfig().discovery.resultsPerQuery;
        const start = ((options.page ?? 1) - 1) * limit;
        const results = this.hits.slice(start, start + limit);
        return { results, hasMore: results.length === limit };
      },
    };
  }
}

export function renderSearchLane(lane: SearchLane): string {
  const source = `site:${lane.source.pattern}`;
  const market = orClause(lane.market.scope.terms.map(quoted));
  if (lane.kind === "board-discovery") {
    return `${source} ${market}`;
  }

  const phrases = orClause(lane.titleTerms.map(quoted));
  if (lane.kind === "worldwide-remote") {
    return `${source} ${phrases} ${market}`;
  }

  const titled = orClause(lane.titleTerms.map(titleClause));
  const strategy = lane.strategy;
  if (!strategy) {
    throw new Error("Role search lanes require a strategy");
  }
  strategy satisfies SearchStrategy;
  if (strategy === "role-first") {
    return `${source} ${titled} ${market}`;
  }
  if (strategy === "location-first") {
    return `${source} ${market} ${titled}`;
  }
  if (strategy === "phrase") {
    return `${source} ${phrases} ${market}`;
  }
  return `${source} ${orClause(lane.titleTerms.map(relaxedTitle))} ${market}`;
}

function titleClause(value: string): string {
  const tokens = value.replaceAll('"', "").split(/\s+/).filter(Boolean);
  return `(${tokens.map((token) => `intitle:"${token}"`).join(" ")})`;
}

function relaxedTitle(value: string): string {
  return `(${value.replaceAll('"', "").split(/\s+/).filter(Boolean).join(" ")})`;
}

function quoted(value: string): string {
  return `"${value.replaceAll('"', "")}"`;
}

function orClause(terms: readonly string[]): string {
  return `(${terms.join(" OR ")})`;
}

export function createSearchProvider(name: string): SearchProvider {
  const providerConfig = requireProviderConfig(name);
  if (!providerConfig.enabled) {
    throw new Error(`${providerConfig.label} is disabled`);
  }
  const apiKey = process.env[providerConfig.apiKeyEnv] ?? "";

  if (name === "brave") {
    return new BraveSearchProvider(apiKey);
  }
  if (name === "serpapi") {
    return new SerpApiSearchProvider(apiKey);
  }
  if (name === "serper") {
    return new SerperSearchProvider(apiKey);
  }
  throw new Error(`Search provider adapter "${name}" is not supported`);
}

export function getSearchProviderOptions(): {
  name: string;
  label: string;
  configured: boolean;
}[] {
  return Object.entries(getJobRadarConfig().searchProviders)
    .filter(([, provider]) => provider.enabled)
    .sort(([, left], [, right]) => left.priority - right.priority)
    .map(([name, provider]) => ({
      name,
      label: provider.label,
      configured: Boolean(process.env[provider.apiKeyEnv]),
    }));
}

function requireProviderConfig(name: string) {
  const provider = getJobRadarConfig().searchProviders[name];
  if (!provider) {
    throw new Error(`Search provider "${name}" is not configured in SQLite`);
  }
  return provider;
}

async function executeWebSearch(
  name: string,
  apiKey: string,
  fetcher: typeof fetch,
  lane: SearchLane,
  query: string,
  options: SearchRequest,
  signal?: AbortSignal,
): Promise<SearchPage> {
  const config = getJobRadarConfig();
  const provider = requireProviderConfig(name);
  const client = createWebSearchClient(
    {
      apiKey,
      endpoint: provider.endpoint,
      label: provider.label,
      maxResults: provider.maxResults,
      name,
      parameters: provider.parameters,
      timeoutMs: config.network.timeoutMs,
    },
    fetcher,
  );
  try {
    return await client.search({
      count: options.count ?? config.discovery.resultsPerQuery,
      countryCode: lane.market.countryCode,
      location: provider.marketLocations[lane.market.scope.key],
      maxAgeDays: options.maxAgeDays,
      page: options.page ?? 1,
      query,
      searchLanguage: lane.market.searchLanguage,
      signal,
    });
  } catch (error) {
    if (!(error instanceof WebSearchFailure)) throw error;
    throw new SearchProviderFailure({
      attempts: error.attempts,
      cause: error,
      classification: error.classification,
      code: error.code,
      message: error.message,
      provider: error.provider,
    });
  }
}
