import { describe, expect, it } from "vitest";

import { extractAnnualSalaryFromText } from "./annual-salary-parser";

describe("annual salary extraction", () => {
  it("reads an annual salary range from job text", () => {
    expect(
      extractAnnualSalaryFromText(
        "The base salary range for this role is £110,000 - £145,000 per year.",
      ),
    ).toEqual({
      currency: "GBP",
      min: 110_000,
      max: 145_000,
    });
  });

  it("supports abbreviated amounts and trailing currency codes", () => {
    expect(extractAnnualSalaryFromText("Annual compensation: 400k to 550k AED.")).toEqual({
      currency: "AED",
      min: 400_000,
      max: 550_000,
    });
  });

  it("does not treat hourly pay as an annual salary", () => {
    expect(extractAnnualSalaryFromText("The pay range is $70,000 - $90,000 per hour.")).toBeNull();
  });

  it("returns no range when salary is absent", () => {
    expect(
      extractAnnualSalaryFromText("Benefits include private healthcare and a pension."),
    ).toBeNull();
  });
});
