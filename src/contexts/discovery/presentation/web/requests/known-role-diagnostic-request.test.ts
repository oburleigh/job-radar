import { describe, expect, it } from "vitest";

import { parseKnownRoleDiagnosticRequest } from "./known-role-diagnostic-request";

describe("known-role diagnostic request", () => {
  it("maps a trimmed public job URL into the application command", () => {
    expect(
      parseKnownRoleDiagnosticRequest("  https://job-boards.greenhouse.io/acme/jobs/123  ", 42),
    ).toEqual({
      status: "valid",
      command: {
        runId: 42,
        jobUrl: "https://job-boards.greenhouse.io/acme/jobs/123",
      },
    });
  });

  it("does not diagnose until the user supplies a URL", () => {
    expect(parseKnownRoleDiagnosticRequest(null, 42)).toEqual({ status: "empty" });
    expect(parseKnownRoleDiagnosticRequest("", 42)).toEqual({ status: "empty" });
    expect(parseKnownRoleDiagnosticRequest("   ", 42)).toEqual({ status: "empty" });
  });

  it("accepts an HTTP job URL without silently requiring TLS", () => {
    expect(parseKnownRoleDiagnosticRequest("http://example.com/jobs/123", 42)).toEqual({
      status: "valid",
      command: { runId: 42, jobUrl: "http://example.com/jobs/123" },
    });
  });

  it.each(["not a URL", "javascript:alert(1)", "ftp://example.com/job"])(
    "rejects the non-public URL %s",
    (jobUrl) => {
      expect(parseKnownRoleDiagnosticRequest(jobUrl, 42)).toEqual({
        status: "invalid",
        message: "Enter a valid public job URL beginning with http:// or https://.",
      });
    },
  );
});
