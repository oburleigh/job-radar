import { describe, expect, it } from "vitest";

import { formatRejectedVendorRecords } from "./response-schema";

describe("vendor record diagnostics", () => {
  it("formats a bounded warning with the total rejected count", () => {
    const warning = formatRejectedVendorRecords([
      rejection("job-1"),
      rejection("job-2"),
      rejection("job-3"),
      rejection("job-4"),
    ]);

    expect(warning).toContain("Skipped 4 invalid vendor records");
    expect(warning).toContain("Ashby ashby:acme job-1: title: expected string");
    expect(warning).toContain("1 more");
    expect(warning).not.toContain("job-4");
  });

  it("returns no warning when every vendor record was accepted", () => {
    expect(formatRejectedVendorRecords([])).toBe("");
  });
});

function rejection(recordIdentity: string) {
  return {
    vendor: "Ashby",
    board: "ashby:acme",
    recordIdentity,
    reason: "title: expected string",
  };
}
