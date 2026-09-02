import { describe, expect, it } from "vitest";
import { researchSourceScope } from "./research-source-scope";

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

  it("governs nothing for a source kind it does not recognise", () => {
    expect(researchSourceScope("typo-in-the-environment")).toEqual({
      executionSettingsGovernRuns: false,
      providerSelectionApplies: false,
      publicSearchSettingsGovernRuns: false,
    });
  });
});
