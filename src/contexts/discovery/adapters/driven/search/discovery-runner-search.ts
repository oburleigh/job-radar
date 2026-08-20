import { runDiscovery } from "@/infrastructure/discovery/runner";
import { createSearchProvider } from "@/infrastructure/discovery/search";
import type { DiscoverySearch } from "../../../hexagon/application/execute-discovery-run";
import type { SearchProvider } from "../../../hexagon/application/search-provider";

type DiscoveryRunnerSearchDependencies = {
  readonly createProvider: (name: string) => SearchProvider;
  readonly run: (
    profileId: number,
    provider: SearchProvider,
    options: { readonly runId: number },
  ) => Promise<unknown>;
};

const defaultDependencies: DiscoveryRunnerSearchDependencies = {
  createProvider: createSearchProvider,
  run: runDiscovery,
};

export function createDiscoveryRunnerSearch(
  dependencies: DiscoveryRunnerSearchDependencies = defaultDependencies,
): DiscoverySearch {
  return {
    async execute({ profileId, providerName, runId }) {
      const provider = dependencies.createProvider(providerName);
      await dependencies.run(profileId, provider, { runId });
    },
  };
}
