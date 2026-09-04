import type { ResearchObservation } from "@/contexts/recruiter-engagement/domain/observation";
import {
  correctDirectoryFact,
  type DirectoryCorrection,
  type RecruiterDirectory,
  reconcileRecruiterDirectory,
  removeDirectoryRecord,
  resolveIdentityReview,
  restoreDirectoryRecord,
} from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import type { RecruiterDirectoryStore } from "./port";

export interface ForMaintainingRecruiterDirectory {
  readonly correctFact: (command: {
    readonly correctedAt: Date;
    readonly field: DirectoryCorrection["field"];
    readonly kind: DirectoryCorrection["kind"];
    readonly recordId: string;
    readonly value: string;
  }) => Promise<RecruiterDirectory>;
  readonly getDirectory: () => Promise<RecruiterDirectory>;
  readonly reconcile: (command: {
    readonly observations: readonly ResearchObservation[];
    readonly recordedAt: Date;
    readonly runId: string;
  }) => Promise<RecruiterDirectory>;
  readonly removeRecord: (command: {
    readonly cascadeRecruiters?: boolean;
    readonly kind: "firm" | "recruiter";
    readonly recordId: string;
    readonly removedAt: Date;
  }) => Promise<RecruiterDirectory>;
  readonly resolveIdentity: (command: {
    readonly decision: "merge" | "keep-separate";
    readonly decidedAt: Date;
    readonly reviewId: string;
  }) => Promise<RecruiterDirectory>;
  readonly restoreRecord: (command: {
    readonly kind: "firm" | "recruiter";
    readonly recordId: string;
  }) => Promise<RecruiterDirectory>;
}

export function createRecruiterDirectoryMaintenance({
  store,
}: {
  readonly store: RecruiterDirectoryStore;
}): ForMaintainingRecruiterDirectory {
  async function save(directory: RecruiterDirectory): Promise<RecruiterDirectory> {
    await store.save(directory);
    return directory;
  }

  return {
    correctFact: async (command) => save(correctDirectoryFact(await store.load(), command)),
    getDirectory: store.load,
    reconcile: async (command) => save(reconcileRecruiterDirectory(await store.load(), command)),
    removeRecord: async (command) => save(removeDirectoryRecord(await store.load(), command)),
    resolveIdentity: async (command) => save(resolveIdentityReview(await store.load(), command)),
    restoreRecord: async (command) => save(restoreDirectoryRecord(await store.load(), command)),
  };
}
