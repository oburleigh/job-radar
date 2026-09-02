import process from "node:process";

const apiKeyName = "BRAVE_SEARCH_API_KEY";

export const missingRealWebSearchApiKeyReason = `${apiKeyName} is not set, so the real web-search browser checks cannot run. Add it to .env, which pnpm test:e2e:web-search-real loads.`;

export function realWebSearchApiKey(): string | undefined {
  return process.env[apiKeyName];
}
