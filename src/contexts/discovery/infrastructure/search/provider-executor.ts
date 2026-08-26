import PQueue from "p-queue";
import pRetry from "p-retry";
import {
  type PreparedSearchRequest,
  type SearchProvider,
  SearchProviderFailure,
} from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import type { RuntimeSettings } from "@/contexts/discovery/application/runtime-settings/settings";

export type SearchProviderExecutionPolicy = RuntimeSettings["discovery"]["providerExecution"];

export interface ScheduledSearchProvider extends SearchProvider {
  readonly onIdle: () => Promise<void>;
  readonly schedule: (
    prepared: PreparedSearchRequest,
    signal?: AbortSignal,
  ) => ReturnType<PreparedSearchRequest["execute"]>;
}

export function createScheduledSearchProvider(
  provider: SearchProvider,
  policy: SearchProviderExecutionPolicy,
): ScheduledSearchProvider {
  const executionQueue = new PQueue();
  const requestQueue = new PQueue({
    concurrency: policy.concurrency,
    intervalCap: policy.requestsPerInterval,
    interval: policy.intervalMs,
    strict: true,
  });

  const schedule: ScheduledSearchProvider["schedule"] = (prepared, signal) =>
    executionQueue.add(
      ({ signal: executionSignal }) =>
        executeWithRetry(provider.name, prepared, executionSignal, policy, requestQueue),
      signal ? { signal } : undefined,
    );
  const prepare: SearchProvider["prepare"] = (lane, request = {}) => {
    const prepared = provider.prepare(lane, request);
    return {
      renderedQuery: prepared.renderedQuery,
      execute: (signal) => schedule(prepared, signal),
    };
  };

  return {
    name: provider.name,
    onIdle: () => executionQueue.onIdle(),
    prepare,
    schedule,
  };
}

async function executeWithRetry(
  providerName: string,
  prepared: PreparedSearchRequest,
  signal: AbortSignal | undefined,
  policy: SearchProviderExecutionPolicy,
  requestQueue: PQueue,
) {
  return pRetry(
    async (attemptNumber) => {
      try {
        return await requestQueue.add(
          () => prepared.execute(signal),
          signal ? { signal } : undefined,
        );
      } catch (error) {
        throw normalizeProviderFailure(providerName, error, attemptNumber);
      }
    },
    {
      retries: policy.maxAttempts - 1,
      factor: 2,
      minTimeout: policy.retryMinDelayMs,
      maxTimeout: policy.retryMaxDelayMs,
      maxRetryTime: policy.retryMaxTimeMs,
      randomize: true,
      ...(signal ? { signal } : {}),
      shouldRetry: ({ error }) =>
        error instanceof SearchProviderFailure && error.classification === "transient",
    },
  );
}

function normalizeProviderFailure(
  provider: string,
  error: unknown,
  attempts: number,
): SearchProviderFailure {
  if (error instanceof SearchProviderFailure) {
    return new SearchProviderFailure({
      provider: error.provider,
      classification: error.classification,
      code: error.code,
      attempts,
      message: error.message,
      cause: error,
    });
  }
  if (error instanceof Error && error.name === "TimeoutError") {
    return new SearchProviderFailure({
      provider,
      classification: "transient",
      code: "timeout",
      attempts,
      message: `${provider} request timed out`,
      cause: error,
    });
  }
  if (error instanceof TypeError) {
    return new SearchProviderFailure({
      provider,
      classification: "transient",
      code: "network-error",
      attempts,
      message: `${provider} request failed: ${error.message}`,
      cause: error,
    });
  }
  return new SearchProviderFailure({
    provider,
    classification: "fatal",
    code: "unexpected-error",
    attempts,
    message: error instanceof Error ? error.message : String(error),
    cause: error,
  });
}
