import { describe, expect, it } from "vitest";
import { resolveTargetMarketLabels } from "./target-location-catalogue";

describe("recruiter Target market catalogue", () => {
  it("canonicalises places, keeps explicit Global Evidence, and rejects unknown values", () => {
    expect(
      resolveTargetMarketLabels([
        "uae",
        "United Kingdom",
        "Global",
        "GLOBAL",
        " Global ",
        "Atlantis",
      ]),
    ).toEqual({
      GLOBAL: "Global",
      Global: "Global",
      " Global ": "Global",
      "United Kingdom": "United Kingdom",
      uae: "United Arab Emirates",
    });
  });
});
