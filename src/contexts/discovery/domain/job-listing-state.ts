export const JOB_LISTING_STATES = ["new", "saved", "applied", "hidden"] as const;

export type JobListingState = (typeof JOB_LISTING_STATES)[number];

export function isJobListingState(value: string): value is JobListingState {
  return JOB_LISTING_STATES.some((state) => state === value);
}
