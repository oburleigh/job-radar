import { describe, expect, it } from "vitest";

import { parseApplicationStartSelection } from "./application-start-selection";

describe("Application start selection", () => {
  it("maps positive integer Opportunity identities from the query", () => {
    expect(
      parseApplicationStartSelection(
        new URL("http://localhost/applications/new?searchProfileId=7&jobListingId=11"),
      ),
    ).toEqual({ ok: true, searchProfileId: 7, jobListingId: 11 });
  });

  it.each([
    "http://localhost/applications/new",
    "http://localhost/applications/new?searchProfileId=0&jobListingId=11",
    "http://localhost/applications/new?searchProfileId=7&jobListingId=1.5",
  ])("rejects an invalid Opportunity identity in %s", (url) => {
    expect(parseApplicationStartSelection(new URL(url))).toEqual({ ok: false });
  });
});
