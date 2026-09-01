import { describe, expect, it } from "vitest";
import { parseExecutionSettingsRequest } from "./execution-settings-request";

function formData(overrides: Record<string, string> = {}): FormData {
  const form = new FormData();
  const values = {
    model: "gpt-5.6-sol",
    reasoningEffort: "high",
    stageRequestLimit: "2",
    stageTimeoutMs: "600000",
    ...overrides,
  };
  for (const [name, value] of Object.entries(values)) form.set(name, value);
  return form;
}

describe("execution settings request", () => {
  it("maps a complete form into the application command", () => {
    expect(parseExecutionSettingsRequest(formData())).toEqual({
      command: {
        model: "gpt-5.6-sol",
        reasoningEffort: "high",
        stageRequestLimit: 2,
        stageTimeoutMs: 600_000,
      },
      ok: true,
    });
  });

  it("rejects a reasoning effort the Codex binary does not accept", () => {
    const result = parseExecutionSettingsRequest(formData({ reasoningEffort: "extreme" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("reasoningEffort");
  });

  it("rejects an empty model", () => {
    const result = parseExecutionSettingsRequest(formData({ model: "  " }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("model");
  });

  it("rejects a stage request allowance of zero", () => {
    const result = parseExecutionSettingsRequest(formData({ stageRequestLimit: "0" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("stageRequestLimit");
  });

  it("rejects a stage timeout below a second", () => {
    const result = parseExecutionSettingsRequest(formData({ stageTimeoutMs: "500" }));
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.field).toBe("stageTimeoutMs");
  });
});
