import { describe, expect, it } from "vitest";
import { parseAdvisorSettingsRequest } from "./advisor-settings-request";

describe("Advisor settings request", () => {
  it("rejects unknown fields instead of silently stripping them", () => {
    const form = new FormData();
    for (const [key, value] of Object.entries({
      intent: "save-advisor-settings",
      enabled: "on",
      model: "test-model",
      reasoningEffort: "high",
      timeoutMs: "10000",
      outputLimit: "4000",
      schemaVersion: "999",
    }))
      form.set(key, value);
    expect(parseAdvisorSettingsRequest(form).ok).toBe(false);
  });

  it.each(["on", null])("parses the checkbox value %s", (enabled) => {
    const form = new FormData();
    form.set("intent", "save-advisor-settings");
    form.set("model", "test-model");
    form.set("reasoningEffort", "medium");
    form.set("timeoutMs", "12000");
    form.set("outputLimit", "5000");
    if (enabled) form.set("enabled", enabled);
    expect(parseAdvisorSettingsRequest(form)).toEqual({
      ok: true,
      command: {
        enabled: enabled === "on",
        model: "test-model",
        reasoningEffort: "medium",
        timeoutMs: 12000,
        outputLimit: 5000,
      },
    });
  });

  it.each(["true", "off", "false"])("rejects malformed enablement %s", (enabled) => {
    const form = new FormData();
    form.set("intent", "save-advisor-settings");
    form.set("model", "test-model");
    form.set("reasoningEffort", "medium");
    form.set("timeoutMs", "12000");
    form.set("outputLimit", "5000");
    form.set("enabled", enabled);
    expect(parseAdvisorSettingsRequest(form)).toEqual({
      ok: false,
      message: "Invalid Advisor settings request.",
    });
  });
});
