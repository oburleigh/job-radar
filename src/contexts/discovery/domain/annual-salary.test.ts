import { describe, expect, it } from "vitest";

import { extractAnnualSalary, formatAnnualSalary } from "./annual-salary";

describe("annual salary extraction", () => {
  it("reads an annual salary range from job text", () => {
    expect(
      extractAnnualSalary("The base salary range for this role is £110,000 - £145,000 per year."),
    ).toEqual({
      currency: "GBP",
      min: 110_000,
      max: 145_000,
    });
  });

  it("supports abbreviated amounts and trailing currency codes", () => {
    expect(extractAnnualSalary("Annual compensation: 400k to 550k AED.")).toEqual({
      currency: "AED",
      min: 400_000,
      max: 550_000,
    });
  });

  it("uses Ashby annual salary components instead of bonus or equity", () => {
    expect(
      extractAnnualSalary("", {
        compensation: {
          summaryComponents: [
            {
              compensationType: "EquityPercentage",
              interval: "NONE",
              currencyCode: null,
              minValue: 0.5,
              maxValue: 1.5,
            },
            {
              compensationType: "Salary",
              interval: "1 YEAR",
              currencyCode: "USD",
              minValue: 180_000,
              maxValue: 220_000,
            },
          ],
        },
      }),
    ).toEqual({
      currency: "USD",
      min: 180_000,
      max: 220_000,
    });
  });

  it("does not treat hourly pay as an annual salary", () => {
    expect(extractAnnualSalary("The pay range is $70,000 - $90,000 per hour.")).toBeNull();
  });

  it("returns no range when salary is absent", () => {
    expect(extractAnnualSalary("Benefits include private healthcare and a pension.")).toBeNull();
  });

  it("formats a range for matching explanations", () => {
    expect(formatAnnualSalary({ currency: "GBP", min: 100_000, max: 140_000 })).toBe(
      "GBP 100,000-140,000",
    );
  });
});
