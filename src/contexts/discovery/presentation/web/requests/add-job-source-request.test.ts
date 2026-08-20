import { describe, expect, it } from "vitest";

import { parseAddJobSourceRequest } from "./add-job-source-request";

describe("add job source request", () => {
  it("normalizes a public URL and optional company name", () => {
    const form = new FormData();
    form.set("url", "https://careers.example.com/jobs");
    form.set("companyName", "  Example  ");

    expect(parseAddJobSourceRequest(form)).toEqual({
      ok: true,
      command: {
        url: "https://careers.example.com/jobs",
        companyName: "Example",
      },
    });
  });

  it("rejects a missing or invalid URL at the web boundary", () => {
    const form = new FormData();
    form.set("url", "not a URL");

    expect(parseAddJobSourceRequest(form)).toEqual({
      ok: false,
      message: "Enter a valid public ATS URL.",
    });
  });
});
