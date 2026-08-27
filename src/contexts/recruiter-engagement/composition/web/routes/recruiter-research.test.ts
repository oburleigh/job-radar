import { describe, expect, it, vi } from "vitest";

import { createRecruiterResearchAction } from "./recruiter-research-action.server";

describe("recruiter research route action", () => {
  it("returns its normal error data when a retry races a terminal-state change", async () => {
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      retryResearchRun: vi.fn(async () => {
        throw new Error("Only a finished recruiter research run can be retried.");
      }),
      startResearchRun: vi.fn(),
    });

    await expect(action(retryRequest("run-1"))).resolves.toEqual({
      error: "Only a finished recruiter research run can be retried.",
    });
  });
});

function retryRequest(runId: string): Request {
  const form = new FormData();
  form.set("intent", "retry");
  form.set("runId", runId);
  return new Request("http://localhost/recruiter-research", {
    method: "POST",
    headers: { host: "localhost" },
    body: form,
  });
}
