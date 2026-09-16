import { describe, expect, it } from "vitest";

import { parseStartApplicationRequest } from "./start-application-request";

describe("start Application request", () => {
  it("maps a Preparing start without asking the user to invent the first Next action", () => {
    expect(
      parseStartApplicationRequest(
        formData({
          searchProfileId: "7",
          jobListingId: "11",
          stage: "preparing",
        }),
      ),
    ).toEqual({
      ok: true,
      command: {
        searchProfileId: 7,
        jobListingId: 11,
        stage: "preparing",
      },
    });
  });

  it("maps an already-Applied start without asking the user to invent the first Next action", () => {
    expect(
      parseStartApplicationRequest(
        formData({
          searchProfileId: "8",
          jobListingId: "12",
          stage: "applied",
        }),
      ),
    ).toEqual({
      ok: true,
      command: {
        searchProfileId: 8,
        jobListingId: 12,
        stage: "applied",
      },
    });
  });

  it.each([
    ["searchProfileId", "0"],
    ["jobListingId", "word"],
    ["stage", "screening"],
  ])("rejects invalid %s input", (field, value) => {
    const input = formData({
      searchProfileId: "7",
      jobListingId: "11",
      stage: "preparing",
    });
    input.set(field, value);
    expect(parseStartApplicationRequest(input)).toEqual({
      ok: false,
      message: "Check the Application start details and try again.",
    });
  });
});

function formData(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}
