import type { JobListingId, SearchProfileId } from "@/contexts/discovery/domain/identifiers";
import type { JobListingState } from "@/contexts/discovery/domain/job-listing-state";

export interface ChangeJobListingStateCommand {
  readonly profileId: SearchProfileId;
  readonly jobId: JobListingId;
  readonly state: JobListingState;
}
