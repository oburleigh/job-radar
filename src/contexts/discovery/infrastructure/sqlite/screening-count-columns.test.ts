import { describe, expect, it } from "vitest";

import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";

import { screeningCountColumns } from "./screening-count-columns";

describe("screening count columns", () => {
  it("counts every exclusion reason occurrence by dashboard category", () => {
    expect(
      screeningCountColumns([
        { code: "title-mismatch" },
        { code: "excluded-title", term: "Intern" },
        { code: "excluded-title", term: "Graduate" },
        { code: "location-mismatch" },
        { code: "excluded-location", term: "London" },
        { code: "stale-listing", maximumAgeDays: 30 },
        { code: "unverified-lead" },
        { code: "missing-required-job-term" },
        { code: "salary-above", salary: salaryRange(120_000, null) },
        { code: "salary-below", salary: salaryRange(null, 80_000) },
      ]),
    ).toEqual({
      excludedTitleReasonCount: 3,
      excludedLocationReasonCount: 2,
      staleReasonCount: 1,
      unverifiedReasonCount: 1,
      contextReasonCount: 1,
      salaryReasonCount: 2,
    });
  });
});

function salaryRange(min: number | null, max: number | null) {
  const range = createAnnualSalaryRange("USD", min, max);
  if (!range) {
    throw new Error("The salary fixture must be a valid annual range.");
  }
  return range;
}
