import type { JobListingState } from "../../../domain/job-listing-state";

export interface ChangeJobListingStateCommand {
  readonly profileId: number;
  readonly jobId: number;
  readonly state: JobListingState;
}
