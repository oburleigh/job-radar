import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  formatRejectedVendorRecords,
  parseVendorRecords,
  type RejectedVendorRecord,
} from "./response-schema";

describe("vendor record diagnostics", () => {
  it("formats a bounded warning with the total rejected count", () => {
    const warning = formatRejectedVendorRecords([
      rejection("job-1"),
      rejection("job-2"),
      rejection("job-3"),
      rejection("job-4"),
    ]);

    expect(warning).toBe(
      "Skipped 4 invalid vendor records. Ashby ashby:acme job-1: title: expected string; Ashby ashby:acme job-2: title: expected string; Ashby ashby:acme job-3: title: expected string; 1 more",
    );
  });

  it("returns no warning when every vendor record was accepted", () => {
    expect(formatRejectedVendorRecords([])).toBe("");
  });

  it("uses singular grammar and omits an unavailable record identity", () => {
    expect(
      formatRejectedVendorRecords([
        { vendor: "Workable", board: "workable:acme", reason: "title: expected string" },
      ]),
    ).toBe("Skipped 1 invalid vendor record. Workable workable:acme: title: expected string");
  });

  it("keeps trimmed string and numeric identities while rejecting malformed records", () => {
    const rejected: RejectedVendorRecord[] = [];
    const accepted = parseVendorRecords({
      vendor: "Example",
      board: "example:board",
      records: [null, { id: "  string-id  " }, { id: 42 }, { title: "Valid" }],
      schema: z.object({ title: z.string() }).loose(),
      identityKeys: ["id"],
      reportRejected: (record) => rejected.push(record),
    });

    expect(accepted).toEqual([{ title: "Valid" }]);
    expect(rejected.map((record) => record.recordIdentity)).toEqual([undefined, "string-id", "42"]);
  });

  it("limits validation reasons to three issues and 500 characters", () => {
    const rejected: Array<{ reason: string }> = [];
    parseVendorRecords({
      vendor: "Example",
      board: "example:board",
      records: [{}],
      schema: z.object({
        first: z.string({ error: "a".repeat(600) }),
        second: z.string(),
        third: z.string(),
        fourth: z.string(),
      }),
      identityKeys: [],
      reportRejected: (record) => rejected.push(record),
    });

    expect(rejected[0]?.reason).toHaveLength(500);
    expect(rejected[0]?.reason).toContain("first:");
    expect(rejected[0]?.reason).not.toContain("fourth:");
    expect(rejected[0]?.reason.endsWith("...")).toBe(true);
  });

  it("does not require a rejection reporter", () => {
    expect(() =>
      parseVendorRecords({
        vendor: "Example",
        board: "example:board",
        records: [null],
        schema: z.object({ title: z.string() }),
        identityKeys: [],
      }),
    ).not.toThrow();
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
