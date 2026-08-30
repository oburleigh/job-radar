import type {
  FirmObservation,
  RecruiterObservation,
  ResearchObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import type {
  ResearchRun,
  ResearchSourceFailure,
  ResearchStage,
} from "@/contexts/recruiter-engagement/domain/research-run";

export interface ResearchRunStore {
  readonly create: (run: ResearchRun) => Promise<void>;
  readonly get: (runId: string) => Promise<ResearchRun | undefined>;
  readonly listAll: () => Promise<readonly ResearchRun[]>;
  readonly listResumable: () => Promise<readonly ResearchRun[]>;
  readonly observationsFor: (runId: string) => Promise<readonly ResearchObservation[]>;
  readonly failuresFor: (runId: string) => Promise<readonly ResearchSourceFailure[]>;
  readonly begin: (runId: string, startedAt: Date) => Promise<ResearchRun | undefined>;
  readonly reserveStageRequest: (
    runId: string,
    stage: Exclude<ResearchStage, "completed">,
    recordedAt: Date,
  ) => Promise<ResearchRun | undefined>;
  readonly acceptStage: (
    runId: string,
    completedStage: Exclude<ResearchStage, "completed">,
    observations: readonly ResearchObservation[],
    recordedAt: Date,
  ) => Promise<ResearchRun | undefined>;
  readonly complete: (runId: string, finishedAt: Date) => Promise<ResearchRun | undefined>;
  readonly fail: (
    runId: string,
    message: string,
    finishedAt: Date,
  ) => Promise<ResearchRun | undefined>;
  readonly cancel: (runId: string, cancelledAt: Date) => Promise<ResearchRun | undefined>;
}

export interface ResearchRunScheduler {
  readonly schedule: (runId: string) => void;
  readonly cancel: (runId: string) => void;
}

export interface ResearchSource {
  readonly assess: (run: ResearchRun) =>
    | { readonly available: true }
    | {
        readonly available: false;
        readonly message: string;
      };
  readonly findFirms: (request: {
    readonly run: ResearchRun;
    readonly signal?: AbortSignal;
  }) => Promise<readonly FirmObservation[]>;
  readonly findRecruiters: (request: {
    readonly run: ResearchRun;
    readonly firms: readonly FirmObservation[];
    readonly signal?: AbortSignal;
  }) => Promise<readonly RecruiterObservation[]>;
}
