import { describe, expect, it } from "vitest";

import { compareAnnualSalary, createAnnualSalaryRange } from "./annual-salary";
import { currencyFrom } from "./currency";

describe("annual salary", () => {
  it("normalizes currency and reverses an inverted range", () => {
    expect(createAnnualSalaryRange("gbp", 145_000, 110_000)).toEqual({
      currency: "GBP",
      min: 110_000,
      max: 145_000,
    });
  });

  it("compares only salaries published in the preferred currency", () => {
    const salary = createAnnualSalaryRange("GBP", 90_000, 120_000);

    expect(
      compareAnnualSalary(salary, {
        currency: currencyFrom("GBP"),
        min: 100_000,
        max: 150_000,
      }),
    ).toBe("overlaps");
    expect(
      compareAnnualSalary(salary, {
        currency: currencyFrom("USD"),
        min: 100_000,
        max: 150_000,
      }),
    ).toBe("not-comparable");
  });

  it.each([
    ["", 100_000, null],
    ["GBP", null, null],
    ["GBP", 9_999, null],
    ["GBP", null, 100_000_001],
    ["GBP", 10_000.5, null],
  ] as const)("rejects an invalid range", (currency, min, max) => {
    expect(createAnnualSalaryRange(currency, min, max)).toBeNull();
  });

  it("supports valid one-sided ranges at the accepted boundaries", () => {
    expect(createAnnualSalaryRange("USD", 10_000, null)).toEqual({
      currency: "USD",
      min: 10_000,
      max: null,
    });
    expect(createAnnualSalaryRange("USD", null, 100_000_000)).toEqual({
      currency: "USD",
      min: null,
      max: 100_000_000,
    });
  });

  it("distinguishes salaries below, above, and overlapping the preference", () => {
    const preference = {
      currency: currencyFrom("GBP"),
      min: 100_000,
      max: 150_000,
    };

    expect(compareAnnualSalary(createAnnualSalaryRange("GBP", 80_000, 99_999), preference)).toBe(
      "below",
    );
    expect(compareAnnualSalary(createAnnualSalaryRange("GBP", 150_001, 180_000), preference)).toBe(
      "above",
    );
    expect(compareAnnualSalary(createAnnualSalaryRange("GBP", null, 120_000), preference)).toBe(
      "overlaps",
    );
    expect(compareAnnualSalary(createAnnualSalaryRange("GBP", 140_000, null), preference)).toBe(
      "overlaps",
    );
  });

  it("cannot compare absent salary or preference currency", () => {
    expect(
      compareAnnualSalary(null, {
        currency: currencyFrom("GBP"),
        min: 100_000,
        max: null,
      }),
    ).toBe("not-comparable");
    expect(
      compareAnnualSalary(createAnnualSalaryRange("GBP", 100_000, null), {
        currency: null,
        min: 100_000,
        max: null,
      }),
    ).toBe("not-comparable");
  });
});
