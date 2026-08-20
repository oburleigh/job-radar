import { describe, expect, it } from "vitest";

import { parseJobListingStateRequest } from "./job-listing-state-request";

describe("job listing state request", () => {
  it("creates a command from positive identifiers and a known state", () => {
    const formData = new FormData();
    formData.set("profileId", "3");
    formData.set("jobId", "9");
    formData.set("status", "saved");

    expect(parseJobListingStateRequest(formData)).toEqual({
      ok: true,
      command: { profileId: 3, jobId: 9, state: "saved" },
    });
  });

  it.each([
    ["profileId", "0"],
    ["jobId", "not-a-number"],
    ["status", "deleted"],
  ])("rejects invalid %s input", (field, value) => {
    const formData = new FormData();
    formData.set("profileId", "3");
    formData.set("jobId", "9");
    formData.set("status", "saved");
    formData.set(field, value);

    expect(parseJobListingStateRequest(formData)).toEqual({
      ok: false,
      message: "Invalid job status request.",
    });
  });
});
