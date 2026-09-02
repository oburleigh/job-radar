export const researchSourceKinds = ["codex", "deterministic", "public-web"] as const;

export type ResearchSourceKind = (typeof researchSourceKinds)[number];

export type ResearchSourceScope = {
  readonly executionSettingsGovernRuns: boolean;
  readonly providerSelectionApplies: boolean;
  readonly publicSearchSettingsGovernRuns: boolean;
};

/**
 * An unrecognised value used to fall through to the Codex Source while the Settings surfaces
 * reported that execution settings governed nothing, so the UI contradicted the engine that
 * was running. Rejecting the value makes that state unreachable.
 */
export function parseResearchSourceKind(value: string | undefined): ResearchSourceKind {
  if (value === undefined || value.trim() === "") {
    return "codex";
  }
  const kind = researchSourceKinds.find((candidate) => candidate === value);
  if (!kind) {
    throw new Error(
      `JOB_RADAR_RECRUITER_RESEARCH_SOURCE must be one of ${researchSourceKinds.join(", ")}, not "${value}".`,
    );
  }
  return kind;
}

export function researchSourceScope(kind: ResearchSourceKind): ResearchSourceScope {
  return {
    executionSettingsGovernRuns: kind === "codex",
    providerSelectionApplies: kind === "public-web",
    publicSearchSettingsGovernRuns: kind === "public-web",
  };
}
