import { describe, expect, it } from "vitest";

import { isJobListingState, JOB_LISTING_STATES } from "./job-listing-state";

describe("job listing state", () => {
  it.each(JOB_LISTING_STATES)("recognizes %s", (state) => {
    expect(isJobListingState(state)).toBe(true);
  });

  it.each(["", "NEW", "deleted", "new-job"])("rejects %j", (value) => {
    expect(isJobListingState(value)).toBe(false);
  });
});
