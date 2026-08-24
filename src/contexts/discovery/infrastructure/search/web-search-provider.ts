import { z } from "zod";
import type {
  SearchProvider,
  SearchRequest,
  SearchResult,
} from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";

const braveResultSchema = z.looseObject({
  title: z.string(),
  description: z.string().optional().default(""),
  url: z.url(),
});
const googleResultSchema = z.looseObject({
  title: z.string(),
  snippet: z.string().optional().default(""),
  link: z.url(),
});
const braveResponseSchema = z.union([
  z
    .looseObject({
      web: z.looseObject({ results: z.array(braveResultSchema) }),
    })
    .transform((payload) => payload.web.results),
  z
    .looseObject({
      type: z.string(),
      query: z.looseObject({}),
      mixed: z.looseObject({}),
    })
    .transform(() => [] as z.infer<typeof braveResultSchema>[]),
]);
const serpApiResponseSchema = z.looseObject({
  organic_results: z.array(googleResultSchema),
});
const serperResponseSchema = z.looseObject({ organic: z.array(googleResultSchema) });
const providerErrorSchema = z.looseObject({ message: z.string().optional() });

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

  async search(query: string, options: SearchRequest = {}): Promise<SearchResult[]> {
    const config = getJobRadarConfig();
    const providerConfig = requireProviderConfig(this.name);
    const url = new URL(providerConfig.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set(
      "count",
      String(
        Math.min(options.count ?? config.discovery.resultsPerQuery, providerConfig.maxResults),
      ),
    );
    for (const [key, value] of Object.entries(providerConfig.parameters)) {
      url.searchParams.set(key, value);
    }
    if (options.maxAgeDays) {
      url.searchParams.set("freshness", dateRange(options.maxAgeDays, new Date()));
    }

    const response = await this.fetcher(url, {
      headers: {
        Accept: "application/json",
        "X-Subscription-Token": this.apiKey,
      },
      signal: AbortSignal.timeout(config.network.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`Brave Search returned HTTP ${response.status}`);
    }

    const results = parseProviderResponse(
      "Brave Search",
      braveResponseSchema,
      await response.json(),
    );
    return results.map((result) => ({
      title: result.title,
      url: result.url,
      snippet: result.description,
    }));
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

  async search(query: string, options: SearchRequest = {}): Promise<SearchResult[]> {
    const config = getJobRadarConfig();
    const providerConfig = requireProviderConfig(this.name);
    const url = new URL(providerConfig.endpoint);
    url.searchParams.set("q", query);
    url.searchParams.set(
      "num",
      String(
        Math.min(options.count ?? config.discovery.resultsPerQuery, providerConfig.maxResults),
      ),
    );
    url.searchParams.set("api_key", this.apiKey);
    for (const [key, value] of Object.entries(providerConfig.parameters)) {
      url.searchParams.set(key, value);
    }

    const response = await this.fetcher(url, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(config.network.timeoutMs),
    });
    if (!response.ok) {
      throw new Error(`SerpAPI returned HTTP ${response.status}`);
    }

    const payload = parseProviderResponse("SerpAPI", serpApiResponseSchema, await response.json());
    return payload.organic_results.map((result) => ({
      title: result.title,
      url: result.link,
      snippet: result.snippet,
    }));
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

  async search(query: string, options: SearchRequest = {}): Promise<SearchResult[]> {
    const config = getJobRadarConfig();
    const providerConfig = requireProviderConfig(this.name);
    const body = {
      ...providerConfig.parameters,
      q: query,
      num: Math.min(options.count ?? config.discovery.resultsPerQuery, providerConfig.maxResults),
      ...(options.maxAgeDays ? { tbs: googleFreshness(options.maxAgeDays) } : {}),
    };
    const response = await this.fetcher(providerConfig.endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "X-API-KEY": this.apiKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(config.network.timeoutMs),
    });
    if (!response.ok) {
      const parsedError = providerErrorSchema.safeParse(await response.json().catch(() => ({})));
      const detail = parsedError.success ? (parsedError.data.message ?? "") : "";
      throw new Error(`Serper.dev returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`);
    }

    const payload = parseProviderResponse(
      "Serper.dev",
      serperResponseSchema,
      await response.json(),
    );
    return payload.organic.map((result) => ({
      title: result.title,
      url: result.link,
      snippet: result.snippet,
    }));
  }
}

export class JsonSearchProvider implements SearchProvider {
  readonly name = "json";

  constructor(private readonly hits: SearchResult[]) {}

  async search(_query: string, options: SearchRequest = {}): Promise<SearchResult[]> {
    return this.hits.slice(0, options.count ?? getJobRadarConfig().discovery.resultsPerQuery);
  }
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

function parseProviderResponse<Output>(
  provider: string,
  schema: z.ZodType<Output>,
  payload: unknown,
): Output {
  const parsed = schema.safeParse(payload);
  if (parsed.success) {
    return parsed.data;
  }
  throw new Error(`${provider} returned an invalid response: ${z.prettifyError(parsed.error)}`, {
    cause: parsed.error,
  });
}

function dateRange(maxAgeDays: number, now: Date): string {
  const start = new Date(now.getTime() - maxAgeDays * 86_400_000);
  return `${isoDate(start)}to${isoDate(now)}`;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function googleFreshness(maxAgeDays: number): string {
  if (maxAgeDays <= 1) {
    return "qdr:d";
  }
  if (maxAgeDays <= 7) {
    return "qdr:w";
  }
  if (maxAgeDays <= 31) {
    return "qdr:m";
  }
  return "qdr:y";
}
