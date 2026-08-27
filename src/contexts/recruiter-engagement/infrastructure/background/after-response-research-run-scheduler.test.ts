import { describe, expect, it } from "vitest";

import { createAfterResponseResearchRunScheduler } from "./after-response-research-run-scheduler";

describe("after-response recruiter research scheduling", () => {
  it("passes an abort signal to deferred execution and cancels it by run id", async () => {
    let deferred: (() => Promise<void>) | undefined;
    let signal: AbortSignal | undefined;
    const scheduler = createAfterResponseResearchRunScheduler({
      afterResponse(callback) {
        deferred = callback;
      },
      execution: {
        async executeResearchRun(_runId, nextSignal) {
          signal = nextSignal;
        },
      },
      reportFailure: () => undefined,
    });

    scheduler.schedule("run-1");
    scheduler.cancel("run-1");
    await deferred?.();

    expect(signal?.aborted).toBe(true);
  });

  it("schedules an active run only once", () => {
    const deferred: (() => Promise<void>)[] = [];
    const scheduler = createAfterResponseResearchRunScheduler({
      afterResponse(callback) {
        deferred.push(callback);
      },
      execution: { async executeResearchRun() {} },
      reportFailure: () => undefined,
    });

    scheduler.schedule("run-1");
    scheduler.schedule("run-1");

    expect(deferred).toHaveLength(1);
  });
});
