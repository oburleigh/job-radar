import { describe, expect, it, vi } from "vitest";

import { createRecruiterResearchAction } from "./recruiter-research-action.server";

describe("recruiter research route action", () => {
  it("starts the run with the user-selected search provider", async () => {
    const startResearchRun = vi.fn(async () => ({ status: "started" as const, runId: "run-1" }));
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord: vi.fn(),
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => [
        { key: "city:ae:dubai", label: "Dubai, United Arab Emirates" },
      ]),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun,
    });

    await action(startRequest());

    expect(startResearchRun).toHaveBeenCalledWith(
      expect.objectContaining({ providerName: "serper" }),
    );
  });

  it("returns its normal error data when a retry races a terminal-state change", async () => {
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord: vi.fn(),
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(async () => {
        throw new Error("Only a finished recruiter research run can be retried.");
      }),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    await expect(action(retryRequest("run-1"))).resolves.toEqual({
      error: "Only a finished recruiter research run can be retried.",
    });
  });

  it("continues a cancelled run and follows the continuation, not the run it continued", async () => {
    const continueResearchRun = vi.fn(async () => ({
      status: "started" as const,
      runId: "run-2",
    }));
    const retryResearchRun = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun,
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord: vi.fn(),
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun,
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    const response = await action(continueRequest("run-1"));

    expect(continueResearchRun).toHaveBeenCalledWith("run-1");
    expect(retryResearchRun).not.toHaveBeenCalled();
    expect((response as Response).headers.get("location")).toBe("/recruiter-search?run=run-2");
  });

  it("returns its normal error data when a continuation races a state change", async () => {
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(async () => {
        throw new Error("This run completed both stages, so it has nothing left to continue.");
      }),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord: vi.fn(),
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    await expect(action(continueRequest("run-1"))).resolves.toEqual({
      error: "This run completed both stages, so it has nothing left to continue.",
    });
  });

  it("removes a firm with its recruiters and returns to the filtered registry", async () => {
    const removeDirectoryRecord = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord,
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    const response = await action(
      registryRequest({
        cascadeRecruiters: "with-recruiters",
        intent: "remove-directory-record",
        kind: "firm",
        recordId: "firm-1",
        showRemoved: "on",
        specialism: "Software engineering",
      }),
    );

    expect(removeDirectoryRecord).toHaveBeenCalledWith({
      cascadeRecruiters: true,
      kind: "firm",
      recordId: "firm-1",
    });
    expect((response as Response).headers.get("location")).toBe(
      "/recruiter-search?view=registry&specialism=Software+engineering&showRemoved=on",
    );
  });

  it("keeps a firm's recruiters when the removal says firm only", async () => {
    const removeDirectoryRecord = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord,
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    await action(
      registryRequest({
        cascadeRecruiters: "firm-only",
        intent: "remove-directory-record",
        kind: "firm",
        recordId: "firm-1",
      }),
    );

    expect(removeDirectoryRecord).toHaveBeenCalledWith({
      cascadeRecruiters: false,
      kind: "firm",
      recordId: "firm-1",
    });
  });

  it("refuses a firm removal that does not say what happens to its recruiters", async () => {
    const removeDirectoryRecord = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord,
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    await expect(
      action(
        registryRequest({
          intent: "remove-directory-record",
          kind: "firm",
          recordId: "firm-1",
        }),
      ),
    ).resolves.toEqual({ error: "Choose what happens to the recruiters at this firm." });
    expect(removeDirectoryRecord).not.toHaveBeenCalled();
  });

  it("removes one recruiter without asking about a cascade", async () => {
    const removeDirectoryRecord = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord,
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    const response = await action(
      registryRequest({
        intent: "remove-directory-record",
        kind: "recruiter",
        recordId: "recruiter-1",
      }),
    );

    expect(removeDirectoryRecord).toHaveBeenCalledWith({
      cascadeRecruiters: false,
      kind: "recruiter",
      recordId: "recruiter-1",
    });
    expect((response as Response).headers.get("location")).toBe("/recruiter-search?view=registry");
  });

  it("restores a removed record", async () => {
    const restoreDirectoryRecord = vi.fn();
    const removeDirectoryRecord = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord,
      restoreDirectoryRecord,
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
      shortlists: shortlistActions(),
      startResearchRun: vi.fn(),
    });

    await action(
      registryRequest({
        intent: "restore-directory-record",
        kind: "firm",
        recordId: "firm-1",
      }),
    );

    expect(restoreDirectoryRecord).toHaveBeenCalledWith({ kind: "firm", recordId: "firm-1" });
    expect(removeDirectoryRecord).not.toHaveBeenCalled();
  });

  it("resolves a pending directory identity from the current run", async () => {
    const resolveDirectoryIdentity = vi.fn();
    const action = createRecruiterResearchAction({
      assertLocalHost: vi.fn(),
      cancelResearchRun: vi.fn(),
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord: vi.fn(),
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity,
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
      continueResearchRun: vi.fn(),
      correctDirectoryFact: vi.fn(),
      removeDirectoryRecord: vi.fn(),
      restoreDirectoryRecord: vi.fn(),
      resolveTargetLocations: vi.fn(() => []),
      retryResearchRun: vi.fn(),
      resolveDirectoryIdentity: vi.fn(),
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

function registryRequest(fields: Record<string, string>): Request {
  const form = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    form.set(name, value);
  }
  return new Request("http://localhost/recruiter-research", {
    method: "POST",
    headers: { host: "localhost" },
    body: form,
  });
}

function continueRequest(runId: string): Request {
  const form = new FormData();
  form.set("intent", "continue");
  form.set("runId", runId);
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
  form.set("providerName", "serper");
  return new Request("http://localhost/recruiter-research", {
    method: "POST",
    headers: { host: "localhost" },
    body: form,
  });
}
