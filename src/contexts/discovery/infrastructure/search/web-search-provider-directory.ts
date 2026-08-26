import type { SearchProvider } from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import type { SearchProviderDirectory } from "@/contexts/discovery/application/discovery-runs/ports/search-provider-directory";
import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";

import {
  createScheduledSearchProvider,
  type SearchProviderExecutionPolicy,
} from "./provider-executor";
import { createSearchProvider } from "./web-search-provider";

type WebSearchProviderDirectoryOptions = {
  readonly createProvider?: (name: string) => SearchProvider;
  readonly readExecutionPolicy?: () => SearchProviderExecutionPolicy;
};

export function createWebSearchProviderDirectory({
  createProvider = createSearchProvider,
  readExecutionPolicy = () => getJobRadarConfig().discovery.providerExecution,
}: WebSearchProviderDirectoryOptions = {}): SearchProviderDirectory {
  const providers = new Map<string, SearchProvider>();
  return {
    get(name) {
      const existing = providers.get(name);
      if (existing) {
        return existing;
      }
      const provider = createProvider(name);
      const activePolicy = readExecutionPolicy();
      let activePolicySignature = JSON.stringify(activePolicy);
      let scheduled = createScheduledSearchProvider(provider, activePolicy);
      let policyTransition: Promise<void> | undefined;
      const prepare: SearchProvider["prepare"] = (lane, request = {}) => {
        const prepared = provider.prepare(lane, request);
        return {
          renderedQuery: prepared.renderedQuery,
          async execute(signal) {
            const requestedPolicy = readExecutionPolicy();
            if (activePolicySignature !== JSON.stringify(requestedPolicy)) {
              policyTransition ??= reconfigureAfterIdle();
            }
            if (policyTransition) {
              if (signal) {
                await waitForPolicyTransition(policyTransition, signal);
              } else {
                await policyTransition;
              }
            }
            return scheduled.schedule(prepared, signal);
          },
        };
      };
      const configured: SearchProvider = {
        name: provider.name,
        prepare,
      };
      providers.set(name, configured);
      return configured;

      async function reconfigureAfterIdle(): Promise<void> {
        const previous = scheduled;
        try {
          await previous.onIdle();
          const latestPolicy = readExecutionPolicy();
          const latestPolicySignature = JSON.stringify(latestPolicy);
          if (activePolicySignature !== latestPolicySignature) {
            scheduled = createScheduledSearchProvider(provider, latestPolicy);
            activePolicySignature = latestPolicySignature;
          }
        } finally {
          policyTransition = undefined;
        }
      }
    },
  };
}

async function waitForPolicyTransition(
  transition: Promise<void>,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) {
    throw abortReason(signal);
  }
  await new Promise<void>((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener("abort", onAbort);
    void transition.then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new DOMException("Cancelled by user", "AbortError");
}
