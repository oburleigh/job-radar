import { afterEach, describe, expect, it, vi } from "vitest";
import {
  type SearchProvider,
  SearchProviderFailure,
} from "@/contexts/discovery/application/discovery-runs/ports/search-provider";

import {
  createScheduledSearchProvider,
  type SearchProviderExecutionPolicy,
} from "./provider-executor";

const policy: SearchProviderExecutionPolicy = {
  concurrency: 2,
  requestsPerInterval: 20,
  intervalMs: 1_000,
  maxAttempts: 3,
  retryMinDelayMs: 0,
  retryMaxDelayMs: 0,
  retryMaxTimeMs: 5_000,
};

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("scheduled search provider", () => {
  it("stops a transient failure after three total attempts", async () => {
    const search = vi.fn(async () => {
      throw providerFailure("transient", "rate-limited");
    });
    const provider = createScheduledSearchProvider(testProvider(search), policy);

    await expect(provider.search("engineering leadership")).rejects.toMatchObject({
      provider: "test",
      classification: "transient",
      code: "rate-limited",
      attempts: 3,
    });
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("classifies provider timeouts as transient and retries them", async () => {
    const search = vi.fn(async () => {
      throw new DOMException("Timed out", "TimeoutError");
    });
    const provider = createScheduledSearchProvider(testProvider(search), policy);

    await expect(provider.search("engineering leadership")).rejects.toMatchObject({
      provider: "test",
      classification: "transient",
      code: "timeout",
      attempts: 3,
      message: "test request timed out",
    });
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("classifies network errors as transient and retries them", async () => {
    const search = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const provider = createScheduledSearchProvider(testProvider(search), policy);

    await expect(provider.search("engineering leadership")).rejects.toMatchObject({
      provider: "test",
      classification: "transient",
      code: "network-error",
      attempts: 3,
      message: "test request failed: fetch failed",
    });
    expect(search).toHaveBeenCalledTimes(3);
  });

  it.each([new Error("unexpected failure"), "unexpected failure"])(
    "classifies an unexpected %s as fatal",
    async (failure) => {
      const search = vi.fn(async () => {
        throw failure;
      });
      const provider = createScheduledSearchProvider(testProvider(search), policy);

      await expect(provider.search("engineering leadership")).rejects.toMatchObject({
        provider: "test",
        classification: "fatal",
        code: "unexpected-error",
        attempts: 1,
        message: "unexpected failure",
      });
      expect(search).toHaveBeenCalledOnce();
    },
  );

  it("keeps exponential retry delays within the configured bounds", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0.5);
    const search = vi.fn(async () => {
      throw providerFailure("transient", "server-error");
    });
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      retryMinDelayMs: 1_000,
      retryMaxDelayMs: 1_500,
    });

    const result = provider.search("engineering leadership");
    const rejection = expect(result).rejects.toMatchObject({ attempts: 3 });
    await vi.advanceTimersByTimeAsync(0);
    expect(search).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1_499);
    expect(search).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(search).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1_499);
    expect(search).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await rejection;
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("stops retrying when the configured retry time is exhausted", async () => {
    vi.useFakeTimers();
    vi.spyOn(Math, "random").mockReturnValue(0);
    const search = vi.fn(async () => {
      throw providerFailure("transient", "server-error");
    });
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      retryMinDelayMs: 1_000,
      retryMaxDelayMs: 1_000,
      retryMaxTimeMs: 999,
    });

    const result = provider.search("engineering leadership");
    const rejection = expect(result).rejects.toMatchObject({ attempts: 2 });
    await vi.advanceTimersByTimeAsync(999);

    await rejection;
    expect(search).toHaveBeenCalledTimes(2);
  });

  it("does not retry a fatal failure", async () => {
    const search = vi.fn(async () => {
      throw providerFailure("fatal", "payment-required");
    });
    const provider = createScheduledSearchProvider(testProvider(search), policy);

    await expect(provider.search("engineering leadership")).rejects.toMatchObject({
      classification: "fatal",
      attempts: 1,
    });
    expect(search).toHaveBeenCalledOnce();
  });

  it("never exceeds the provider concurrency bound", async () => {
    const releases: Array<() => void> = [];
    let active = 0;
    let maximumActive = 0;
    const search = vi.fn(
      () =>
        new Promise<readonly []>((resolve) => {
          active += 1;
          maximumActive = Math.max(maximumActive, active);
          releases.push(() => {
            active -= 1;
            resolve([]);
          });
        }),
    );
    const provider = createScheduledSearchProvider(testProvider(search), policy);

    const searches = [provider.search("one"), provider.search("two"), provider.search("three")];
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(2));
    expect(maximumActive).toBe(2);

    releases.shift()?.();
    await vi.waitFor(() => expect(search).toHaveBeenCalledTimes(3));
    releases.splice(0).forEach((release) => {
      release();
    });

    await expect(Promise.all(searches)).resolves.toEqual([[], [], []]);
    expect(maximumActive).toBe(2);
  });

  it("does not exceed the provider request rate", async () => {
    vi.useFakeTimers();
    const search = vi.fn<SearchProvider["search"]>().mockResolvedValue([]);
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      concurrency: 3,
      requestsPerInterval: 2,
      intervalMs: 1_000,
    });

    const searches = [provider.search("one"), provider.search("two"), provider.search("three")];
    await vi.advanceTimersByTimeAsync(0);
    expect(search).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(search).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(Promise.all(searches)).resolves.toEqual([[], [], []]);
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("counts retry attempts against the provider request rate", async () => {
    vi.useFakeTimers();
    const search = vi
      .fn<SearchProvider["search"]>()
      .mockRejectedValueOnce(providerFailure("transient", "rate-limited"))
      .mockRejectedValueOnce(providerFailure("transient", "rate-limited"))
      .mockResolvedValue([]);
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      concurrency: 1,
      requestsPerInterval: 2,
      intervalMs: 1_000,
    });

    const result = provider.search("engineering leadership");
    await vi.advanceTimersByTimeAsync(0);
    expect(search).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(999);
    expect(search).toHaveBeenCalledTimes(2);
    await vi.advanceTimersByTimeAsync(1);

    await expect(result).resolves.toEqual([]);
    expect(search).toHaveBeenCalledTimes(3);
  });

  it("does not start a queued request after cancellation", async () => {
    const firstRelease = Promise.withResolvers<readonly []>();
    const search = vi
      .fn<SearchProvider["search"]>()
      .mockImplementationOnce(() => firstRelease.promise)
      .mockResolvedValue([]);
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      concurrency: 1,
    });
    const controller = new AbortController();

    const first = provider.search("one");
    const cancelled = provider.search("two", { signal: controller.signal });
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Cancelled by user", "AbortError"));

    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    expect(search).toHaveBeenCalledOnce();
    firstRelease.resolve([]);
    await expect(first).resolves.toEqual([]);
  });

  it("does not start a rate-limited request after cancellation", async () => {
    vi.useFakeTimers();
    const firstRelease = Promise.withResolvers<readonly []>();
    const search = vi
      .fn<SearchProvider["search"]>()
      .mockImplementationOnce(() => firstRelease.promise)
      .mockResolvedValue([]);
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      concurrency: 2,
      requestsPerInterval: 1,
      intervalMs: 1_000,
    });
    const controller = new AbortController();

    const first = provider.search("one");
    const cancelled = provider.search("two", { signal: controller.signal });
    await vi.advanceTimersByTimeAsync(0);
    expect(search).toHaveBeenCalledOnce();
    controller.abort(new DOMException("Cancelled by user", "AbortError"));
    await expect(cancelled).rejects.toMatchObject({ name: "AbortError" });
    await vi.advanceTimersByTimeAsync(1_000);
    expect(search).toHaveBeenCalledOnce();

    firstRelease.resolve([]);
    await expect(first).resolves.toEqual([]);
  });

  it("propagates cancellation from an active provider request without retrying", async () => {
    const controller = new AbortController();
    const cancellation = new DOMException("Cancelled by user", "AbortError");
    const search = vi.fn<SearchProvider["search"]>(
      (_query, request) =>
        new Promise((_, reject) => {
          request?.signal?.addEventListener("abort", () => reject(request.signal?.reason), {
            once: true,
          });
        }),
    );
    const provider = createScheduledSearchProvider(testProvider(search), policy);

    const result = provider.search("engineering", { signal: controller.signal });
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    controller.abort(cancellation);

    await expect(result).rejects.toBe(cancellation);
    expect(search).toHaveBeenCalledOnce();
  });

  it("cancels a pending retry timer before another attempt starts", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => {
      throw providerFailure("transient", "timeout");
    });
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      retryMinDelayMs: 1_000,
      retryMaxDelayMs: 1_000,
    });
    const controller = new AbortController();

    const result = provider.search("engineering", { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Cancelled by user", "AbortError"));
    await vi.runAllTimersAsync();

    await rejection;
    expect(search).toHaveBeenCalledOnce();
  });

  it("lets the execution lane become idle when a retry timer is cancelled", async () => {
    vi.useFakeTimers();
    const search = vi.fn(async () => {
      throw providerFailure("transient", "timeout");
    });
    const provider = createScheduledSearchProvider(testProvider(search), {
      ...policy,
      retryMinDelayMs: 1_000,
      retryMaxDelayMs: 1_000,
    });
    const controller = new AbortController();

    const result = provider.search("engineering", { signal: controller.signal });
    const rejection = expect(result).rejects.toMatchObject({ name: "AbortError" });
    await vi.waitFor(() => expect(search).toHaveBeenCalledOnce());
    controller.abort(new DOMException("Cancelled by user", "AbortError"));
    await rejection;
    let idle = false;
    void provider.onIdle().then(() => {
      idle = true;
    });
    await vi.advanceTimersByTimeAsync(0);

    expect(idle).toBe(true);
  });
});

function testProvider(search: SearchProvider["search"]): SearchProvider {
  return { name: "test", search };
}

function providerFailure(
  classification: "fatal" | "transient",
  code: string,
): SearchProviderFailure {
  return new SearchProviderFailure({
    provider: "test",
    classification,
    code,
    attempts: 1,
    message: `${classification} ${code}`,
  });
}
