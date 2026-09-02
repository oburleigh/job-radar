import { describe, expect, it } from "vitest";
import { defaultRecruiterResearchSettings } from "@/contexts/recruiter-engagement/infrastructure/sqlite/bootstrap-recruiter-research";
import { codexAdapterId, createCodexAdapterPolicy, createCodexSourcePlan } from "./codex-policy";

const settings = defaultRecruiterResearchSettings;

describe("codex adapter policy", () => {
  it("identifies the local Codex source", () => {
    expect(createCodexAdapterPolicy(settings).id).toBe(codexAdapterId);
  });

  it("takes its request limit from the configured execution settings", () => {
    expect(createCodexAdapterPolicy(settings).rateLimit.stageRequestLimit).toBe(
      settings.execution.stageRequestLimit,
    );
  });

  it("is enabled and states what happens when it is not", () => {
    const policy = createCodexAdapterPolicy(settings);
    expect(policy.enabled).toBe(true);
    expect(policy.disabledBehavior).toMatch(/Codex/);
  });
});

describe("codex source plan", () => {
  it("plans one entry per stage against the Codex adapter", () => {
    const plan = createCodexSourcePlan(settings);
    expect(plan.entries.map((entry) => entry.stage)).toEqual(["firms", "recruiters"]);
    expect(plan.entries.every((entry) => entry.adapterId === codexAdapterId)).toBe(true);
  });

  it("allows each stage the configured number of Codex invocations", () => {
    expect(createCodexSourcePlan(settings).stageRequestAllowance).toEqual({
      firms: settings.execution.stageRequestLimit,
      recruiters: settings.execution.stageRequestLimit,
    });
  });

  it("carries no public search policy, because it pages no search provider", () => {
    expect(createCodexSourcePlan(settings).publicSearch).toBeNull();
  });

  it("freezes the model, reasoning effort and stage timeout the run will use", () => {
    const chosen = {
      ...settings,
      execution: {
        ...settings.execution,
        model: "gpt-5.6-terra",
        reasoningEffort: "low" as const,
        stageTimeoutMs: 123_000,
      },
    };
    expect(createCodexSourcePlan(chosen).execution).toEqual({
      model: "gpt-5.6-terra",
      reasoningEffort: "low",
      stageTimeoutMs: 123_000,
    });
  });

  it("does not repeat the stage request limit, which the allowance already freezes", () => {
    expect(createCodexSourcePlan(settings).execution).not.toHaveProperty("stageRequestLimit");
  });
});
