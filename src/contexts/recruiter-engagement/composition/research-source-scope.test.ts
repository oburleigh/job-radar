import { describe, expect, it } from "vitest";
import {
  parseResearchSourceKind,
  researchSourceKinds,
  researchSourceScope,
} from "./research-source-scope";

describe("research source scope", () => {
  it("gives the Codex Source its execution settings and no public search settings", () => {
    expect(researchSourceScope("codex")).toEqual({
      executionSettingsGovernRuns: true,
      providerSelectionApplies: false,
      publicSearchSettingsGovernRuns: false,
    });
  });

  it("gives the public-web Source its search settings and no execution settings", () => {
    expect(researchSourceScope("public-web")).toEqual({
      executionSettingsGovernRuns: false,
      providerSelectionApplies: true,
      publicSearchSettingsGovernRuns: true,
    });
  });

  it("tells the deterministic Source that neither set of settings decides its runs", () => {
    expect(researchSourceScope("deterministic")).toEqual({
      executionSettingsGovernRuns: false,
      providerSelectionApplies: false,
      publicSearchSettingsGovernRuns: false,
    });
  });
});

describe("reading the research source from the environment", () => {
  it("defaults to the Codex Source when nothing is set", () => {
    expect(parseResearchSourceKind(undefined)).toBe("codex");
    expect(parseResearchSourceKind("")).toBe("codex");
    expect(parseResearchSourceKind("   ")).toBe("codex");
  });

  it.each(researchSourceKinds)("accepts %s", (kind) => {
    expect(parseResearchSourceKind(kind)).toBe(kind);
  });

  it.each(["Codex", "public_web", "typo-in-the-environment"])(
    "refuses %s rather than silently running the Codex Source",
    (value) => {
      expect(() => parseResearchSourceKind(value)).toThrow(
        /JOB_RADAR_RECRUITER_RESEARCH_SOURCE must be one of codex, deterministic, public-web/,
      );
    },
  );

  it("names the value it refused, so the typo is visible", () => {
    expect(() => parseResearchSourceKind("public–web")).toThrow(/not "public–web"/);
  });
});
