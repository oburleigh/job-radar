import { afterEach, expect, it, vi } from "vitest";
import {
  type SearchProvider,
  SearchProviderFailure,
} from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import type { SearchProviderExecutionPolicy } from "./provider-executor";

import { createWebSearchProviderDirectory } from "./web-search-provider-directory";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("shares one bounded execution lane for each provider", async () => {
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<SearchProvider["search"]>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
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

  const first = directory.get("test").search("one");
  const second = directory.get("test").search("two");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());

  firstRelease.resolve([]);
  await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  expect(search).toHaveBeenCalledTimes(2);
});

it("applies changed execution settings after the existing lane becomes idle", async () => {
  let executionPolicy = policy({ maxAttempts: 3 });
  const search = vi.fn<SearchProvider["search"]>().mockRejectedValue(
    new SearchProviderFailure({
      provider: "test",
      classification: "transient",
      code: "rate-limited",
      attempts: 1,
      message: "rate limited",
    }),
  );
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  await expect(provider.search("one")).rejects.toMatchObject({ attempts: 3 });
  executionPolicy = policy({ maxAttempts: 1 });
  await expect(provider.search("two")).rejects.toMatchObject({ attempts: 1 });

  expect(search).toHaveBeenCalledTimes(4);
});

it("does not overlap old and new execution lanes while settings change", async () => {
  let executionPolicy = policy({ concurrency: 1 });
  const firstRelease = Promise.withResolvers<readonly []>();
  const search = vi
    .fn<SearchProvider["search"]>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  const first = provider.search("one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  const second = provider.search("two");
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
    .fn<SearchProvider["search"]>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");
  const controller = new AbortController();

  const first = provider.search("one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  const cancelled = provider.search("two", { signal: controller.signal });
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
    .fn<SearchProvider["search"]>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");
  const controller = new AbortController();

  const first = provider.search("one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  controller.abort("Cancelled by user");

  await expect(provider.search("two", { signal: controller.signal })).rejects.toMatchObject({
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
    .fn<SearchProvider["search"]>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");
  const controller = new AbortController();

  const first = provider.search("one");
  await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
  executionPolicy = policy({ concurrency: 2 });
  const second = provider.search("two", { signal: controller.signal });
  firstRelease.resolve([]);

  await expect(Promise.all([first, second])).resolves.toEqual([[], []]);
  expect(search).toHaveBeenCalledTimes(2);
});

it("keeps the active rate window when execution settings are unchanged", async () => {
  vi.useFakeTimers();
  const search = vi.fn<SearchProvider["search"]>().mockResolvedValue([]);
  const executionPolicy = policy({ requestsPerInterval: 1, intervalMs: 1_000 });
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  const first = provider.search("one");
  await vi.advanceTimersByTimeAsync(0);
  await expect(first).resolves.toEqual([]);
  const second = provider.search("two");
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
    .fn<SearchProvider["search"]>()
    .mockImplementationOnce(() => firstRelease.promise)
    .mockResolvedValue([]);
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  const first = provider.search("one");
  await vi.advanceTimersByTimeAsync(0);
  expect(search).toHaveBeenCalledOnce();
  executionPolicy = { ...originalPolicy, maxAttempts: 1 };
  const second = provider.search("two");
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
  const search = vi.fn<SearchProvider["search"]>().mockRejectedValue(
    new SearchProviderFailure({
      provider: "test",
      classification: "transient",
      code: "rate-limited",
      attempts: 1,
      message: "rate limited",
    }),
  );
  const directory = createWebSearchProviderDirectory({
    createProvider: (name) => ({ name, search }),
    readExecutionPolicy: () => executionPolicy,
  });
  const provider = directory.get("test");

  executionPolicy = policy({ maxAttempts: 1 });
  await expect(provider.search("one")).rejects.toMatchObject({ attempts: 1 });
  executionPolicy = policy({ maxAttempts: 2 });
  await expect(provider.search("two")).rejects.toMatchObject({ attempts: 2 });

  expect(search).toHaveBeenCalledTimes(3);
});

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
