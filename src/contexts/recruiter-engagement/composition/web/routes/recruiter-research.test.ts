import { describe, expect, it, vi } from "vitest";

import { createRecruiterResearchAction } from "./recruiter-research-action.server";

describe("recruiter research route action", () => {
  it("persists the user-selected Codex execution before starting the run", async () => {
    const saveResearchExecutionSettings = vi.fn();
    const startResearchRun = vi.fn(async () => ({ status: "started" as const, runId: "run-1" }));
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      resolveTargetLocations: vi.fn(() => [
        { key: "city:ae:dubai", label: "Dubai, United Arab Emirates" },
      ]),
      retryResearchRun: vi.fn(),
      saveResearchExecutionSettings,
      startResearchRun,
    });

    await action(startRequest());

    expect(saveResearchExecutionSettings).toHaveBeenCalledWith({
      model: "gpt-5.6",
      reasoningEffort: "high",
    });
    expect(startResearchRun).toHaveBeenCalledTimes(1);
  });

  it("returns its normal error data when a retry races a terminal-state change", async () => {
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(async () => {
        throw new Error("Only a finished recruiter research run can be retried.");
      }),
      saveResearchExecutionSettings: vi.fn(),
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

function startRequest(): Request {
  const form = new FormData();
  form.set("intent", "start");
  form.set("brief", "Find recruitment firms for a product leadership role.");
  form.set("targetLocations", "Dubai, United Arab Emirates");
  form.set("specialisms", "Product");
  form.set("industries", "Financial services");
  form.set("firmTarget", "1");
  form.set("recruiterTarget", "1");
  form.set("model", "gpt-5.6");
  form.set("reasoningEffort", "high");
  return new Request("http://localhost/recruiter-research", {
    method: "POST",
    headers: { host: "localhost" },
    body: form,
  });
}
