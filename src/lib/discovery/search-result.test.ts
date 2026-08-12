import { describe, expect, it } from "vitest";

import { inferLocationHint, normalizeSearchResult } from "./search-result";

describe("search result normalization", () => {
  it("extracts a LinkedIn role, company, and actual location from the title", () => {
    expect(
      normalizeSearchResult(
        "linkedin",
        "Ripple hiring Director of Engineering in San Francisco, California, United States | LinkedIn",
        "Ripple also has offices in London and Dubai.",
      ),
    ).toMatchObject({
      title: "Director of Engineering",
      companyName: "Ripple",
      locationText: "San Francisco, California, United States",
    });
  });

  it("does not use an arbitrary snippet as a location", () => {
    expect(
      normalizeSearchResult(
        "ashby",
        "Senior Engineering Manager - Jobs - Ashby",
        "Our team works with colleagues in Dubai and London.",
      ),
    ).toMatchObject({
      title: "Senior Engineering Manager",
      locationText: "",
    });
  });

  it("extracts truncated LinkedIn titles returned by web search", () => {
    expect(
      normalizeSearchResult(
        "linkedin",
        "Salt hiring Head of Engineering in Dubai, United Arab ...",
        "Get notified about new Head of Engineering jobs in Dubai.",
      ),
    ).toMatchObject({
      title: "Head of Engineering",
      companyName: "Salt",
      locationText: "Dubai, United Arab",
    });
  });

  it("uses only a location stated in a custom search result", () => {
    expect(
      inferLocationHint(["Dubai", "UAE"], {
        title: "Head of Engineering",
        description: "Build the team from our Dubai office.",
      }),
    ).toBe("Dubai");
    expect(
      inferLocationHint(["Dubai", "UAE"], {
        title: "Head of Engineering",
        description: "Build a distributed engineering team.",
      }),
    ).toBe("");
  });
});
