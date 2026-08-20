import { describe, expect, it, vi } from "vitest";

import type { SearchProvider } from "../../../hexagon/application/search-provider";

import { createDiscoveryRunnerSearch } from "./discovery-runner-search";

describe("discovery runner search adapter", () => {
  it("translates an execution into the existing discovery runner call", async () => {
    const provider: SearchProvider = { name: "serper", search: vi.fn(async () => []) };
    const createProvider = vi.fn(() => provider);
    const run = vi.fn(async () => ({ runId: 41 }));
    const search = createDiscoveryRunnerSearch({ createProvider, run });

    await search.execute({ profileId: 7, providerName: "serper", runId: 41 });

    expect(createProvider).toHaveBeenCalledWith("serper");
    expect(run).toHaveBeenCalledWith(7, provider, { runId: 41 });
  });
});
