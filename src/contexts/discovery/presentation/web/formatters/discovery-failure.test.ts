import { describe, expect, it } from "vitest";

import { formatDiscoveryFailure } from "./discovery-failure";

describe("discovery failure messages", () => {
  it("turns exhausted Serper credits into an actionable message", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serper",
        errorSummary:
          "jobs.ashbyhq.com / Staff Platform Engineer: Serper.dev returned HTTP 400: Not enough credits",
      }),
    ).toBe("Serper.dev has no credits remaining. Choose another provider or add credits.");
  });

  it("keeps an unknown failure concise and points to the detailed history", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: "jobs.example.com / Staff Engineer: Search provider timed out",
      }),
    ).toBe("Search provider timed out. Try again or review run history for details.");
  });

  it("keeps the provider but removes HTTP transport noise from an unknown failure", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serper",
        errorSummary: "Serper.dev returned HTTP 503: Deterministic provider failure",
      }),
    ).toBe(
      "Serper.dev: Deterministic provider failure. Try again or review run history for details.",
    );
  });

  it("explains provider rate limits without exposing the raw HTTP failure", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: "Brave Search returned HTTP 429: rate limit exceeded",
      }),
    ).toBe("Brave Search rate limit reached. Wait before retrying or choose another provider.");
  });

  it("points rejected provider credentials back to local configuration", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serpapi",
        errorSummary: "SerpAPI returned HTTP 401: Unauthorized",
      }),
    ).toBe(
      "SerpAPI rejected its API key. Check the credential in .env or choose another provider.",
    );
  });

  it("retains a useful fallback when no failure detail was recorded", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: "",
      }),
    ).toBe("Platform leadership did not finish. Review run history for details.");
  });
});
