import { describe, expect, it } from "vitest";

import { filterCurrentDiscoveryRuns, reconcilePendingRunIds } from "./discovery-notifications";

describe("discovery notification polling reconciliation", () => {
  it("removes ids omitted by a storage event and suppresses their re-adoption", () => {
    const pendingIds = new Set([41, 42]);
    const suppressedIds = new Set<number>();

    reconcilePendingRunIds(pendingIds, [42], suppressedIds);

    expect([...pendingIds]).toEqual([42]);
    expect([...suppressedIds]).toEqual([41]);
  });

  it("drops delayed statuses that are no longer pending", () => {
    const delayedRuns = [{ id: 41 }, { id: 42 }, { id: 43 }];

    expect(filterCurrentDiscoveryRuns(delayedRuns, new Set([42]), new Set([43]))).toEqual([
      { id: 42 },
    ]);
  });
});
