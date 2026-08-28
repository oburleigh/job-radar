import { describe, expect, it } from "vitest";

import { createSaveResearchExecutionSettings } from "./save-execution-settings";

describe("save research execution settings", () => {
  it("persists the selected Codex execution values at the application clock time", () => {
    const replacements: {
      execution: { model: string | null; reasoningEffort: string | null };
      at: Date;
    }[] = [];
    const changedAt = new Date("2026-08-28T10:30:00.000Z");
    const save = createSaveResearchExecutionSettings({
      now: () => changedAt,
      settings: {
        replaceExecution: (execution, at) => replacements.push({ execution, at }),
      },
    });

    expect(save({ model: "gpt-5.6", reasoningEffort: "high" })).toEqual({ status: "saved" });
    expect(replacements).toEqual([
      { execution: { model: "gpt-5.6", reasoningEffort: "high" }, at: changedAt },
    ]);
  });

  it("allows the user to return to their Codex account defaults", () => {
    const replacements: { model: string | null; reasoningEffort: string | null }[] = [];
    const save = createSaveResearchExecutionSettings({
      now: () => new Date(),
      settings: { replaceExecution: (execution) => replacements.push(execution) },
    });

    expect(save({ model: null, reasoningEffort: null })).toEqual({ status: "saved" });
    expect(replacements).toEqual([{ model: null, reasoningEffort: null }]);
  });
});
