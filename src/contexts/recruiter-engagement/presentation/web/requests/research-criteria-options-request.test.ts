import { describe, expect, it } from "vitest";

import { parseResearchCriteriaOptionsRequest } from "./research-criteria-options-request";

describe("research criteria options request", () => {
  it("maps unique, non-empty catalogue entries into the application command", () => {
    const formData = new FormData();
    formData.set("industries", "Technology\nFinancial services\nTechnology");
    formData.set("specialisms", "Software engineering\nData and AI");

    expect(parseResearchCriteriaOptionsRequest(formData)).toEqual({
      ok: true,
      command: {
        industries: ["Technology", "Financial services"],
        specialisms: ["Software engineering", "Data and AI"],
      },
    });
  });

  it("rejects an empty catalogue", () => {
    const formData = new FormData();
    formData.set("industries", "");
    formData.set("specialisms", "Software engineering");

    expect(parseResearchCriteriaOptionsRequest(formData)).toMatchObject({
      field: "industries",
      ok: false,
    });
  });
});
