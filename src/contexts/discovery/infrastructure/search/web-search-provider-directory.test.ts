import { afterEach, expect, it, vi } from "vitest";
import {
  type SearchProvider,
  SearchProviderFailure,
  type SearchRequest,
  type SearchResult,
} from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import type { SearchProviderExecutionPolicy } from "./provider-executor";

import { createWebSearchProviderDirectory } from "./web-search-provider-directory";

type ExecuteSearch = (
  query: string,
  request?: SearchRequest & { readonly signal?: AbortSignal },
) => Promise<ReadonlyArray<SearchResult>>;

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("renders during preparation but chooses the execution lane only when execution starts", async () => {
  const execute = vi.fn(async () => []);
  const prepare = vi.fn((query: string) => ({ query: `rendered:${query}`, execute }));
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, prepare }),
    readExecutionPolicy: () => policy(),
  });

  const prepared = directory.get("test").prepare("one");

  expect(prepared.query).toBe("rendered:one");
  expect(prepare).toHaveBeenCalledOnce();
  expect(execute).not.toHaveBeenCalled();

  const controller = new AbortController();
  await expect(prepared.execute(controller.signal)).resolves.toEqual([]);

  expect(execute).toHaveBeenCalledWith(controller.signal);
});

it("shares one bounded execution lane for each provider", async () => {
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<ExecuteSearch>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => ({
      concurrency: 1,
      requestsPerInterval: 20,
      intervalMs: 1_000,
      maxAttempts: 3,
      retryMinDelayMs: 0,
      retryMaxDelayMs: 0,
      retryMaxTimeMs: 5_000,
    }),
  });

  const first = execute(directory.get("test"), "one");
  const second = execute(directory.get("test"), "two");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());

  firstRelease.resolve([]);
  await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  expect(search).toHaveBeenCalledTimes(2);
});

it("applies changed execution settings after the existing lane becomes idle", async () => {
  let executionPolicy = policy({ maxAttempts: 3 });
  const search = vi.fn<ExecuteSearch>().mockRejectedValue(
    new SearchProviderFailure({
      provider: "test",
      classification: "transient",
      code: "rate-limited",
      attempts: 1,
      message: "rate limited",
    }),
  );
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  await expect(execute(provider, "one")).rejects.toMatchObject({ attempts: 3 });
  executionPolicy = policy({ maxAttempts: 1 });
  await expect(execute(provider, "two")).rejects.toMatchObject({ attempts: 1 });

  expect(search).toHaveBeenCalledTimes(4);
});

it("does not overlap old and new execution lanes while settings change", async () => {
  let executionPolicy = policy({ concurrency: 1 });
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<ExecuteSearch>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  const first = execute(provider, "one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  const second = execute(provider, "two");
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(search).toHaveBeenCalledOnce();

  firstRelease.resolve([]);
  await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  expect(search).toHaveBeenCalledTimes(2);
});

it("rejects cancellation while a request waits for a settings transition", async () => {
  let executionPolicy = policy({ concurrency: 1 });
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<ExecuteSearch>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");
  const controller = new AbortController();

  const first = execute(provider, "one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  const cancelled = execute(provider, "two", { signal: controller.signal });
  controller.abort(new DOMException("Cancelled by user", "AbortError"));

  await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
  expect(search).toHaveBeenCalledOnce();
  firstRelease.resolve([]);
  await expect(first).resolves.toEqual([]);
});

it("rejects a request already cancelled before a settings transition", async () => {
  let executionPolicy = policy({ concurrency: 1 });
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<ExecuteSearch>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");
  const controller = new AbortController();

  const first = execute(provider, "one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  controller.abort("Cancelled by user");

  await expect(execute(provider, "two", { signal: controller.signal })).rejects.toMatchObject({
    name: "AbortError",
    message: "Cancelled by user",
  });
  expect(search).toHaveBeenCalledOnce();
  firstRelease.resolve([]);
  await expect(first).resolves.toEqual([]);
});

it("continues a signalled request when a settings transition finishes first", async () => {
  let executionPolicy = policy({ concurrency: 1 });
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<ExecuteSearch>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");
  const controller = new AbortController();

  const first = execute(provider, "one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  const second = execute(provider, "two", { signal: controller.signal });
  firstRelease.resolve([]);

  await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  expect(search).toHaveBeenCalledTimes(2);
});

it("keeps the active rate window when execution settings are unchanged", async () => {
  vi.useFakeTimers();
  const search = vi.fn<ExecuteSearch>().mockResolvedValue([]);
  const executionPolicy = policy({ requestsPerInterval: 1, intervalMs: 1_000 });
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  const first = execute(provider, "one");
  await vi.advanceTimersByTimeAsync(0);
  await expect(first).resolves.toEqual([]);
  const second = execute(provider, "two");
  await vi.advanceTimersByTimeAsync(999);
  expect(search).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);

  await expect(second).resolves.toEqual([]);
  expect(search).toHaveBeenCalledTimes(2);
});

it("keeps the active lane when settings revert during a transition", async () => {
  vi.useFakeTimers();
  const originalPolicy = policy({ requestsPerInterval: 1, intervalMs: 1_000 });
  let executionPolicy = originalPolicy;
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<ExecuteSearch>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  const first = execute(provider, "one");
  await vi.advanceTimersByTimeAsync(0);
  expect(search).toHaveBeenCalledOnce();
  executionPolicy = { ...originalPolicy, maxAttempts: 1 };
  const second = execute(provider, "two");
  executionPolicy = originalPolicy;
  firstRelease.resolve([]);
  await expect(first).resolves.toEqual([]);
  await vi.advanceTimersByTimeAsync(999);
  expect(search).toHaveBeenCalledOnce();
  await vi.advanceTimersByTimeAsync(1);

  await expect(second).resolves.toEqual([]);
  expect(search).toHaveBeenCalledTimes(2);
});

it("applies another settings change after a completed transition", async () => {
  let executionPolicy = policy({ maxAttempts: 3 });
  const search = vi.fn<ExecuteSearch>().mockRejectedValue(
    new SearchProviderFailure({
      provider: "test",
      classification: "transient",
      code: "rate-limited",
      attempts: 1,
      message: "rate limited",
    }),
  );
  const directory = createWebSearchProviderDirectory({
    createProvider: providerFactory(search),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  executionPolicy = policy({ maxAttempts: 1 });
  await expect(execute(provider, "one")).rejects.toMatchObject({ attempts: 1 });
  executionPolicy = policy({ maxAttempts: 2 });
  await expect(execute(provider, "two")).rejects.toMatchObject({ attempts: 2 });

  expect(search).toHaveBeenCalledTimes(3);
});

function providerFactory(search: ExecuteSearch): (name: string) => SearchProvider {
  return (name) => ({
    name,
    prepare: (query, request = {}) => ({
      query,
      execute: (signal) => search(query, { ...request, ...(signal ? { signal } : {}) }),
    }),
  });
}

function execute(
  provider: SearchProvider,
  query: string,
  request: SearchRequest & { readonly signal?: AbortSignal } = {},
) {
  const { signal, ...preparation } = request;
  return provider.prepare(query, preparation).execute(signal);
}

function policy(
  overrides: Partial<SearchProviderExecutionPolicy> = {},
): SearchProviderExecutionPolicy {
  return {
    concurrency: 1,
    requestsPerInterval: 20,
    intervalMs: 1_000,
    maxAttempts: 3,
    retryMinDelayMs: 0,
    retryMaxDelayMs: 0,
    retryMaxTimeMs: 5_000,
    ...overrides,
  };
}
