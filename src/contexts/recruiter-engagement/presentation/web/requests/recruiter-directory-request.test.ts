import { describe, expect, it } from "vitest";
import { parseRecruiterDirectoryRequest } from "./recruiter-directory-request";

describe("recruiter directory request", () => {
  it("accepts an identity decision", () => {
    expect(
      parseRecruiterDirectoryRequest(
        "resolve-identity",
        form({ decision: "merge", reviewId: "review-1" }),
      ),
    ).toEqual({
      ok: true,
      command: { decision: "merge", intent: "resolve-identity", reviewId: "review-1" },
    });
  });

  it("rejects an invalid work-email correction", () => {
    expect(
      parseRecruiterDirectoryRequest(
        "correct-directory-fact",
        form({
          field: "workEmail",
          kind: "recruiter",
          recordId: "recruiter:linkedin.com/in/amina-khan",
          value: "not an email",
        }),
      ),
    ).toEqual({ ok: false, message: "Enter a valid work email." });
  });
});

function form(values: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}
