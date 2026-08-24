import { describe, expect, it } from "vitest";

import type { DiagnoseKnownRoleResult } from "./result";
import { createDiagnoseKnownRole } from "./use-case";

describe("diagnose known role", () => {
  it("returns the provider-free diagnostic produced by the evidence reader", () => {
    const command = {
      runId: 42,
      jobUrl: "https://job-boards.greenhouse.io/acme/jobs/123",
    };
    const diagnostic: DiagnoseKnownRoleResult = {
      status: "diagnosed" as const,
      requestedUrl: command.jobUrl,
      canonicalUrl: command.jobUrl,
      profileId: 7,
      source: { code: "supported-source" as const, atsType: "greenhouse" },
      queryPlan: { code: "no-query-planned" as const, queries: [] },
      providerResponse: { code: "provider-not-returned" as const },
      classification: { code: "not-reached" as const },
      verification: { code: "not-observed" as const, storedJob: null },
      matching: {
        code: "not-evaluated" as const,
        score: null,
        reasons: [],
        exclusionReasons: [],
      },
    };
    const reads: unknown[] = [];
    const diagnose = createDiagnoseKnownRole({
      diagnostics: {
        diagnose(received) {
          reads.push(received);
          return diagnostic;
        },
      },
    });

    expect(diagnose(command)).toEqual(diagnostic);
    expect(reads).toEqual([command]);
  });
});
