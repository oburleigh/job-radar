import { describe, expect, it, vi } from "vitest";

import { createRecruiterResearchAction } from "./recruiter-research-action.server";

describe("recruiter research route action", () => {
  it("persists the user-selected Codex execution before starting the run", async () => {
    const saveResearchExecutionSettings = vi.fn();
    const startResearchRun = vi.fn(async () => ({ status: "started" as const, runId: "run-1" }));
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      resolveTargetLocations: vi.fn(() => [
        { key: "city:ae:dubai", label: "Dubai, United Arab Emirates" },
      ]),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      saveResearchExecutionSettings,
      shortlists: shortlistActions(),
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
      correctDirectoryFact: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(async () => {
        throw new Error("Only a finished recruiter research run can be retried.");
      }),
      resolveDirectoryIdentity: vi.fn(),
      saveResearchExecutionSettings: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    await expect(action(retryRequest("run-1"))).resolves.toEqual({
      error: "Only a finished recruiter research run can be retried.",
    });
  });

  it("resolves a pending directory identity from the current run", async () => {
    const resolveDirectoryIdentity = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity,
      saveResearchExecutionSettings: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    const response = await action(directoryRequest());

    expect(resolveDirectoryIdentity).toHaveBeenCalledWith({
      decision: "merge",
      reviewId: "review-1",
    });
    expect(response).toBeInstanceOf(Response);
    expect((response as Response).headers.get("location")).toBe("/recruiter-search?run=run-1");
  });

  it("records Do Not Contact for a Prospect from the current run", async () => {
    const shortlists = shortlistActions();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      saveResearchExecutionSettings: vi.fn(),
      shortlists,
      startResearchRun: vi.fn(),
    });

    const response = await action(shortlistContactExclusionRequest());

    expect(shortlists.setContactExclusion).toHaveBeenCalledWith({
      contactExclusion: "do-not-contact",
      recruiterId: "recruiter-1",
      shortlistId: "shortlist-1",
    });
    expect((response as Response).headers.get("location")).toBe("/recruiter-search?run=run-1");
  });
});

function shortlistActions() {
  return {
    addProspect: vi.fn(),
    create: vi.fn(),
    delete: vi.fn(),
    removeProspect: vi.fn(),
    setContactExclusion: vi.fn(),
  };
}

function directoryRequest(): Request {
  const form = new FormData();
  form.set("intent", "resolve-identity");
  form.set("runId", "run-1");
  form.set("reviewId", "review-1");
  form.set("decision", "merge");
  return new Request("http://localhost/recruiter-research", {
    method: "POST",
    headers: { host: "localhost" },
    body: form,
  });
}

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

function shortlistContactExclusionRequest(): Request {
  const form = new FormData();
  form.set("intent", "set-contact-exclusion");
  form.set("runId", "run-1");
  form.set("shortlistId", "shortlist-1");
  form.set("recruiterId", "recruiter-1");
  form.set("contactExclusion", "do-not-contact");
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
