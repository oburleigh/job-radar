import { describe, expect, it } from "vitest";
import {
  createSaveExecutionSettings,
  type ExecutionSettingsCommand,
} from "./save-execution-settings";

const command: ExecutionSettingsCommand = {
  model: "gpt-5.6-sol",
  reasoningEffort: "high",
  stageRequestLimit: 2,
  stageTimeoutMs: 600_000,
};

describe("save execution settings", () => {
  it("hands the command to the settings store with the current time", () => {
    const recorded: { settings?: ExecutionSettingsCommand; changedAt?: Date } = {};
    const changedAt = new Date("2026-09-01T12:00:00.000Z");
    const save = createSaveExecutionSettings({
      now: () => changedAt,
      settings: {
        replaceExecution: (settings, at) => {
          recorded.settings = settings;
          recorded.changedAt = at;
        },
      },
    });

    expect(save(command)).toEqual({ status: "saved" });
    expect(recorded.settings).toEqual(command);
    expect(recorded.changedAt).toEqual(changedAt);
  });
});
