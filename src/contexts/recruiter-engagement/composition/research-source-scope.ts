export type ResearchSourceKind = "codex" | "deterministic" | "public-web";

export type ResearchSourceScope = {
  readonly executionSettingsGovernRuns: boolean;
  readonly providerSelectionApplies: boolean;
  readonly publicSearchSettingsGovernRuns: boolean;
};

export function researchSourceScope(kind: string): ResearchSourceScope {
  return {
    executionSettingsGovernRuns: kind === "codex",
    providerSelectionApplies: kind === "public-web",
    publicSearchSettingsGovernRuns: kind === "public-web",
  };
}
