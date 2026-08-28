import { describe, expect, it } from "vitest";

import { parseResearchExecutionSettingsRequest } from "./research-execution-settings-request";

describe("research execution settings request", () => {
  it("maps configured Codex model and reasoning values into the application command", () => {
    const formData = new FormData();
    formData.set("model", "gpt-5.6");
    formData.set("reasoningEffort", "high");

    expect(parseResearchExecutionSettingsRequest(formData)).toEqual({
      ok: true,
      command: { model: "gpt-5.6", reasoningEffort: "high" },
    });
  });

  it("maps blank fields to the Codex account defaults", () => {
    expect(parseResearchExecutionSettingsRequest(new FormData())).toEqual({
      ok: true,
      command: { model: null, reasoningEffort: null },
    });
  });
});
