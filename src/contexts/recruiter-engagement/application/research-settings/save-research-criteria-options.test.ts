import { describe, expect, it, vi } from "vitest";

import { createSaveResearchCriteriaOptions } from "./save-research-criteria-options";

describe("save research criteria options", () => {
  it("persists the complete catalogues at the application clock time", () => {
    const replaceResearchCriteriaOptions = vi.fn();
    const changedAt = new Date("2026-08-31T10:30:00.000Z");
    const save = createSaveResearchCriteriaOptions({
      now: () => changedAt,
      settings: { replaceResearchCriteriaOptions },
    });
    const options = {
      industries: ["Technology", "Financial services"],
      specialisms: ["Software engineering", "Data and AI"],
    };

    expect(save(options)).toEqual({ status: "saved" });
    expect(replaceResearchCriteriaOptions).toHaveBeenCalledWith(options, changedAt);
  });
});
