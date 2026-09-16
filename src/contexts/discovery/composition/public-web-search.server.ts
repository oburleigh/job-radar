import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { createWebSearchClient } from "@/platform/search/web-search-client";

export function createConfiguredWebSearchClient(name: string) {
  const config = getJobRadarConfig();
  const provider = config.searchProviders[name];
  if (!provider?.enabled) {
    throw new Error(`Web search provider "${name}" is not enabled.`);
  }
  return createWebSearchClient({
    apiKey: process.env[provider.apiKeyEnv] ?? "",
    endpoint: provider.endpoint,
    label: provider.label,
    maxResults: provider.maxResults,
    name,
    parameters: provider.parameters,
    timeoutMs: config.network.timeoutMs,
  });
}

export function getConfiguredWebSearchProviderOptions() {
  return Object.entries(getJobRadarConfig().searchProviders)
    .filter(([, provider]) => provider.enabled)
    .sort(([, left], [, right]) => left.priority - right.priority)
    .map(([name, provider]) => ({
      configured: Boolean(process.env[provider.apiKeyEnv]),
      label: provider.label,
      name,
    }));
}
