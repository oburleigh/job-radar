import type { DirectoryMatchWeights } from "@/contexts/recruiter-engagement/domain/recruiter-directory";

export interface RecruiterDirectoryMatchSettingsStore {
  readonly replaceDirectoryMatchWeights: (weights: DirectoryMatchWeights, changedAt: Date) => void;
}

export function createSaveDirectoryMatchWeights({
  now,
  settings,
}: {
  readonly now: () => Date;
  readonly settings: RecruiterDirectoryMatchSettingsStore;
}) {
  return (weights: DirectoryMatchWeights) => {
    settings.replaceDirectoryMatchWeights(weights, now());
    return { status: "saved" as const };
  };
}
