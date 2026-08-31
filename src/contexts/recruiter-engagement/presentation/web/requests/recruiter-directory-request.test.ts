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

  it("accepts named Shortlist and Prospect commands", () => {
    expect(
      parseRecruiterDirectoryRequest(
        "create-shortlist",
        form({ name: " UAE software recruiters " }),
      ),
    ).toEqual({
      ok: true,
      command: { intent: "create-shortlist", name: "UAE software recruiters" },
    });
    expect(
      parseRecruiterDirectoryRequest(
        "add-prospect",
        form({ recruiterId: "recruiter-1", shortlistId: "shortlist-1" }),
      ),
    ).toEqual({
      ok: true,
      command: {
        intent: "add-prospect",
        recruiterId: "recruiter-1",
        shortlistId: "shortlist-1",
      },
    });
    expect(
      parseRecruiterDirectoryRequest(
        "remove-prospect",
        form({ recruiterId: "recruiter-1", shortlistId: "shortlist-1" }),
      ),
    ).toEqual({
      ok: true,
      command: {
        intent: "remove-prospect",
        recruiterId: "recruiter-1",
        shortlistId: "shortlist-1",
      },
    });
    expect(
      parseRecruiterDirectoryRequest("delete-shortlist", form({ shortlistId: "shortlist-1" })),
    ).toEqual({
      ok: true,
      command: { intent: "delete-shortlist", shortlistId: "shortlist-1" },
    });
  });

  it("accepts Do Not Contact and rejects the DNC alias", () => {
    expect(
      parseRecruiterDirectoryRequest(
        "set-contact-exclusion",
        form({
          contactExclusion: "do-not-contact",
          recruiterId: "recruiter-1",
          shortlistId: "shortlist-1",
        }),
      ),
    ).toEqual({
      ok: true,
      command: {
        contactExclusion: "do-not-contact",
        intent: "set-contact-exclusion",
        recruiterId: "recruiter-1",
        shortlistId: "shortlist-1",
      },
    });
    expect(
      parseRecruiterDirectoryRequest(
        "set-contact-exclusion",
        form({
          contactExclusion: "dnc",
          recruiterId: "recruiter-1",
          shortlistId: "shortlist-1",
        }),
      ),
    ).toEqual({ ok: false, message: "Choose a valid contact exclusion." });
  });
});

function form(values: Readonly<Record<string, string>>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(values)) {
    formData.set(key, value);
  }
  return formData;
}
