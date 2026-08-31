import { z } from "zod";

export type WebSearchResult = {
  readonly snippet: string;
  readonly title: string;
  readonly url: string;
};

export type WebSearchPage = {
  readonly hasMore: boolean;
  readonly results: readonly WebSearchResult[];
};

export type WebSearchRequest = {
  readonly count: number;
  readonly countryCode?: string | null;
  readonly location?: string | undefined;
  readonly maxAgeDays?: number | undefined;
  readonly page: number;
  readonly query: string;
  readonly searchLanguage?: string | null;
  readonly signal?: AbortSignal | undefined;
};

export type WebSearchClientConfig = {
  readonly apiKey: string;
  readonly endpoint: string;
  readonly label: string;
  readonly maxResults: number;
  readonly name: string;
  readonly parameters: Readonly<Record<string, string>>;
  readonly timeoutMs: number;
};

export type WebSearchFailureClassification = "fatal" | "transient";

export class WebSearchFailure extends Error {
  readonly attempts = 1;
  readonly classification: WebSearchFailureClassification;
  readonly code: string;
  readonly provider: string;

  constructor(input: {
    readonly cause?: unknown;
    readonly classification: WebSearchFailureClassification;
    readonly code: string;
    readonly message: string;
    readonly provider: string;
  }) {
    super(input.message, { cause: input.cause });
    this.name = "WebSearchFailure";
    this.classification = input.classification;
    this.code = input.code;
    this.provider = input.provider;
  }
}

export interface WebSearchClient {
  readonly search: (request: WebSearchRequest) => Promise<WebSearchPage>;
}

const braveResultSchema = z.looseObject({
  description: z.string().optional().default(""),
  title: z.string(),
  url: z.url(),
});
const googleResultSchema = z.looseObject({
  link: z.url(),
  snippet: z.string().optional().default(""),
  title: z.string(),
});
const braveResponseSchema = z.union([
  z.looseObject({
    query: z.looseObject({ more_results_available: z.boolean().optional() }).optional(),
    web: z.looseObject({ results: z.array(braveResultSchema) }),
  }),
  z
    .looseObject({
      mixed: z.looseObject({}),
      query: z.looseObject({}),
      type: z.string(),
    })
    .transform(() => ({ web: { results: [] as z.infer<typeof braveResultSchema>[] } })),
]);
const serpApiResponseSchema = z.looseObject({
  organic_results: z.array(googleResultSchema),
  serpapi_pagination: z.looseObject({ next: z.string().optional() }).optional(),
});
const serperResponseSchema = z.looseObject({
  hasMore: z.boolean().optional(),
  organic: z.array(googleResultSchema),
  pagination: z.looseObject({ next: z.string().optional() }).optional(),
});
const providerErrorSchema = z.looseObject({ message: z.string().optional() });

export function createWebSearchClient(
  config: WebSearchClientConfig,
  fetcher: typeof fetch = fetch,
): WebSearchClient {
  if (!config.apiKey) {
    throw new Error(`${config.label} API key is not configured`);
  }
  if (config.name === "brave") {
    return { search: (request) => searchBrave(config, request, fetcher) };
  }
  if (config.name === "serpapi") {
    return { search: (request) => searchSerpApi(config, request, fetcher) };
  }
  if (config.name === "serper") {
    return { search: (request) => searchSerper(config, request, fetcher) };
  }
  throw new Error(`Web search provider adapter "${config.name}" is not supported`);
}

async function searchBrave(
  config: WebSearchClientConfig,
  request: WebSearchRequest,
  fetcher: typeof fetch,
): Promise<WebSearchPage> {
  const requestedLimit = Math.min(request.count, config.maxResults);
  const url = new URL(config.endpoint);
  url.searchParams.set("q", request.query);
  url.searchParams.set("count", String(requestedLimit));
  addParameters(url.searchParams, config.parameters);
  if (request.maxAgeDays) {
    url.searchParams.set("freshness", dateRange(request.maxAgeDays, new Date()));
  }
  if (request.countryCode) {
    url.searchParams.set("country", request.countryCode);
  }
  if (request.searchLanguage) {
    url.searchParams.set("search_lang", request.searchLanguage);
    url.searchParams.set(
      "ui_lang",
      request.countryCode
        ? `${request.searchLanguage}-${request.countryCode}`
        : request.searchLanguage,
    );
  }
  url.searchParams.set("offset", String(request.page - 1));
  const response = await fetcher(url, {
    headers: { Accept: "application/json", "X-Subscription-Token": config.apiKey },
    signal: requestSignal(request.signal, config.timeoutMs),
  });
  await requireOk(config, response);
  const payload = parseResponse(config, braveResponseSchema, await response.json());
  const results = payload.web.results.map((result) => ({
    snippet: result.description,
    title: result.title,
    url: result.url,
  }));
  return {
    hasMore:
      ("query" in payload ? payload.query?.more_results_available : undefined) ??
      results.length === requestedLimit,
    results,
  };
}

async function searchSerpApi(
  config: WebSearchClientConfig,
  request: WebSearchRequest,
  fetcher: typeof fetch,
): Promise<WebSearchPage> {
  const requestedLimit = Math.min(request.count, config.maxResults);
  const url = new URL(config.endpoint);
  url.searchParams.set("q", request.query);
  url.searchParams.set("num", String(requestedLimit));
  url.searchParams.set("api_key", config.apiKey);
  addParameters(url.searchParams, config.parameters);
  addGoogleMarket(url.searchParams, request);
  url.searchParams.set("start", String((request.page - 1) * requestedLimit));
  const response = await fetcher(url, {
    headers: { Accept: "application/json" },
    signal: requestSignal(request.signal, config.timeoutMs),
  });
  await requireOk(config, response);
  const payload = parseResponse(config, serpApiResponseSchema, await response.json());
  const results = payload.organic_results.map((result) => ({
    snippet: result.snippet,
    title: result.title,
    url: result.link,
  }));
  return {
    hasMore:
      payload.serpapi_pagination === undefined
        ? results.length === requestedLimit
        : Boolean(payload.serpapi_pagination.next),
    results,
  };
}

async function searchSerper(
  config: WebSearchClientConfig,
  request: WebSearchRequest,
  fetcher: typeof fetch,
): Promise<WebSearchPage> {
  const requestedLimit = Math.min(request.count, config.maxResults);
  const response = await fetcher(config.endpoint, {
    body: JSON.stringify({
      ...config.parameters,
      gl: request.countryCode?.toLowerCase(),
      hl: request.searchLanguage ?? undefined,
      num: requestedLimit,
      page: request.page,
      q: request.query,
      ...(request.maxAgeDays ? { tbs: googleFreshness(request.maxAgeDays) } : {}),
    }),
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-API-KEY": config.apiKey,
    },
    method: "POST",
    signal: requestSignal(request.signal, config.timeoutMs),
  });
  await requireOk(config, response);
  const payload = parseResponse(config, serperResponseSchema, await response.json());
  const results = payload.organic.map((result) => ({
    snippet: result.snippet,
    title: result.title,
    url: result.link,
  }));
  return {
    hasMore:
      payload.hasMore ??
      (payload.pagination === undefined
        ? results.length === requestedLimit
        : Boolean(payload.pagination.next)),
    results,
  };
}

function addParameters(
  parameters: URLSearchParams,
  configured: Readonly<Record<string, string>>,
): void {
  for (const [key, value] of Object.entries(configured)) {
    parameters.set(key, value);
  }
}

function addGoogleMarket(parameters: URLSearchParams, request: WebSearchRequest): void {
  if (request.location) parameters.set("location", request.location);
  if (request.countryCode) parameters.set("gl", request.countryCode.toLowerCase());
  if (request.searchLanguage) parameters.set("hl", request.searchLanguage);
}

function requestSignal(signal: AbortSignal | undefined, timeoutMs: number): AbortSignal {
  const timeout = AbortSignal.timeout(timeoutMs);
  return signal ? AbortSignal.any([signal, timeout]) : timeout;
}

function parseResponse<Output>(
  config: WebSearchClientConfig,
  schema: z.ZodType<Output>,
  value: unknown,
): Output {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new WebSearchFailure({
    cause: parsed.error,
    classification: "fatal",
    code: "invalid-response",
    message: `${config.label} returned an invalid response: ${z.prettifyError(parsed.error)}`,
    provider: config.name,
  });
}

async function requireOk(config: WebSearchClientConfig, response: Response): Promise<void> {
  if (response.ok) return;
  const parsed = providerErrorSchema.safeParse(await response.json().catch(() => ({})));
  const detail = parsed.success ? (parsed.data.message ?? "") : "";
  const message = `${config.label} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}`;
  if (/not enough credits|insufficient credits|quota exceeded/i.test(detail)) {
    throw failure(config, "fatal", "credit-exhausted", message);
  }
  if (response.status === 401 || response.status === 403) {
    throw failure(config, "fatal", "authentication-rejected", message);
  }
  if (response.status === 402) throw failure(config, "fatal", "payment-required", message);
  if (response.status === 429) throw failure(config, "transient", "rate-limited", message);
  if ([500, 502, 503, 504].includes(response.status)) {
    throw failure(config, "transient", "server-error", message);
  }
  throw failure(config, "fatal", "invalid-request", message);
}

function failure(
  config: WebSearchClientConfig,
  classification: WebSearchFailureClassification,
  code: string,
  message: string,
): WebSearchFailure {
  return new WebSearchFailure({ classification, code, message, provider: config.name });
}

function dateRange(maxAgeDays: number, now: Date): string {
  const start = new Date(now.getTime() - maxAgeDays * 86_400_000);
  return `${isoDate(start)}to${isoDate(now)}`;
}

function isoDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function googleFreshness(maxAgeDays: number): string {
  if (maxAgeDays <= 1) return "qdr:d";
  if (maxAgeDays <= 7) return "qdr:w";
  if (maxAgeDays <= 31) return "qdr:m";
  return "qdr:y";
}
