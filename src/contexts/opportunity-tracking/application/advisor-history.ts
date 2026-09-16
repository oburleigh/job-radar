import type { AdvisorPolicy } from "./advisor-workflow";

export interface AdvisorExecutionStart {
  readonly kind: "assessment" | "relationship-plan";
  readonly searchProfileId: number;
  readonly jobListingId: number;
  readonly applicationId: number | null;
  readonly policy: AdvisorPolicy;
  readonly startedAt: Date;
}

export interface AdvisorExecutionFinish {
  readonly id: number;
  readonly status: "completed" | "rejected" | "failed" | "cancelled" | "timed-out";
  readonly reason: string | null;
  readonly finishedAt: Date;
}

export interface AdvisorExecutionRecord extends AdvisorExecutionStart {
  readonly id: number;
  readonly status: AdvisorExecutionFinish["status"] | "running";
  readonly reason: string | null;
  readonly finishedAt: Date | null;
  readonly retryOf: number | null;
}

export interface AdvisorHistory {
  readonly start: (record: AdvisorExecutionStart) => number;
  readonly finish: (record: AdvisorExecutionFinish) => void;
}
