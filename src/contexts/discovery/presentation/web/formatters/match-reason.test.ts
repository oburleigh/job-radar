import { describe, expect, it } from "vitest";

import { createAnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";
import type { ExclusionReason, MatchReason } from "@/contexts/discovery/domain/job-match";
import { formatAnnualSalary } from "./annual-salary";
import { formatExclusionReason, formatMatchReason } from "./match-reason";

describe("match reason formatting", () => {
  it("formats typed domain reasons for people", () => {
    expect(formatMatchReason({ code: "title-match", term: "Head of Engineering" })).toBe(
      "Title matches Head of Engineering",
    );
    const salary = createAnnualSalaryRange("GBP", 90_000, 120_000);
    expect(salary && formatMatchReason({ code: "salary-overlap", salary })).toBe(
      "Salary GBP 90,000-120,000 overlaps the profile preference",
    );
  });

  it("formats typed exclusions without changing their classification", () => {
    expect(formatExclusionReason({ code: "location-mismatch" })).toBe(
      "Location does not match the profile",
    );
    expect(formatExclusionReason({ code: "stale-listing", maximumAgeDays: 30 })).toBe(
      "Posted more than 30 days ago",
    );
  });

  it("formats every match reason code", () => {
    const cases: readonly [MatchReason, string][] = [
      [{ code: "job-context-match", term: "platform" }, "Job context matches platform"],
      [{ code: "location-match", term: "Dubai" }, "Location matches Dubai"],
      [
        { code: "location-uncertain", term: "Canada" },
        "Location uncertain: check eligibility for Canada",
      ],
      [{ code: "remote-allowed" }, "Remote role allowed by profile"],
      [{ code: "posted-age", days: 1 }, "Posted 1 day ago"],
      [{ code: "posted-age", days: 4 }, "Posted 4 days ago"],
      [{ code: "posting-date-unknown" }, "Posting date unavailable"],
    ];

    for (const [reason, message] of cases) {
      expect(formatMatchReason(reason)).toBe(message);
    }
  });

  it("formats every exclusion reason code", () => {
    const below = createAnnualSalaryRange("GBP", null, 80_000);
    const above = createAnnualSalaryRange("GBP", 180_000, null);
    if (!below || !above) {
      throw new Error("Expected valid salary fixtures");
    }
    const cases: readonly [ExclusionReason, string][] = [
      [{ code: "unverified-lead" }, "Web-search lead is not verified by a structured listing"],
      [{ code: "legacy", detail: "Original historical reason" }, "Original historical reason"],
      [{ code: "excluded-title", term: "intern" }, "Excluded title term: intern"],
      [{ code: "excluded-description", term: "clearance" }, "Excluded description term: clearance"],
      [{ code: "missing-required-job-term" }, "Missing a required job keyword"],
      [{ code: "title-mismatch" }, "Title does not match a target role"],
      [{ code: "excluded-location", term: "US" }, "Excluded location term: US"],
      [
        { code: "salary-below", salary: below },
        "Salary GBP up to 80,000 is below the preferred range",
      ],
      [{ code: "salary-above", salary: above }, "Salary GBP 180,000+ is above the preferred range"],
      [{ code: "score-below", minimumScore: 70 }, "Score is below 70"],
    ];

    for (const [reason, message] of cases) {
      expect(formatExclusionReason(reason)).toBe(message);
    }
  });

  it("formats a fixed salary", () => {
    const fixed = createAnnualSalaryRange("USD", 120_000, 120_000);
    if (!fixed) {
      throw new Error("Expected a valid fixed salary fixture");
    }

    expect(formatAnnualSalary(fixed)).toBe("USD 120,000");
  });
});
