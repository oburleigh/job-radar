import { describe, expect, it } from "vitest";

import { STALE_DISCOVERY_RUN_CODE } from "@/contexts/discovery/domain/stale-discovery-run";
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

  it("turns a structured exhausted-credit failure into an actionable message", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serper",
        errorSummary: "serper fatal credit-exhausted after 1 attempt; skipped 369 queries",
      }),
    ).toBe("Serper.dev has no credits remaining. Choose another provider or add credits.");
  });

  it("turns a structured payment failure into an actionable message", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: "brave fatal payment-required after 1 attempt; skipped 369 queries",
      }),
    ).toBe("Brave Search requires payment. Choose another provider or update its plan.");
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

  it("explains a structured rate-limit failure", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: "brave transient rate-limited after 3 attempts; skipped 0 queries",
      }),
    ).toBe("Brave Search rate limit reached. Wait before retrying or choose another provider.");
  });

  it("explains an exhausted structured server failure", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serper",
        errorSummary: "serper transient server-error after 3 attempts; skipped 26 queries",
      }),
    ).toBe(
      "Serper.dev was unavailable after 3 attempts. Try again later or choose another provider.",
    );
  });

  it.each([
    [
      "serper transient server-error; skipped 26 queries",
      "Serper.dev was unavailable. Try again later or choose another provider.",
    ],
    [
      "serper transient server-error after 1 attempt; skipped 0 queries",
      "Serper.dev was unavailable after 1 attempt. Try again later or choose another provider.",
    ],
    [
      "serper transient server-error after 12 attempts; skipped 0 queries",
      "Serper.dev was unavailable after 12 attempts. Try again later or choose another provider.",
    ],
  ])("formats server failure detail %s", (errorSummary, expected) => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serper",
        errorSummary,
      }),
    ).toBe(expected);
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

  it("explains a structured authentication failure", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serpapi",
        errorSummary: "serpapi fatal authentication-rejected after 1 attempt; skipped 12 queries",
      }),
    ).toBe(
      "SerpAPI rejected its API key. Check the credential in .env or choose another provider.",
    );
  });

  it("recognizes a localized unauthorised failure without an HTTP status", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "serpapi",
        errorSummary: "Unauthorised provider credential",
      }),
    ).toBe(
      "SerpAPI rejected its API key. Check the credential in .env or choose another provider.",
    );
  });

  it("turns the stale-run marker into the message the operator can act on", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: STALE_DISCOVERY_RUN_CODE,
      }),
    ).toBe(
      "The local app stopped receiving progress from this discovery. Start a new run to retry.",
    );
  });

  it("does not treat provider prose that merely mentions stale data as a stale run", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: "Brave Search returned HTTP 500: stale index shard",
      }),
    ).toBe("Brave Search: stale index shard. Try again or review run history for details.");
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

  it("treats whitespace-only failure detail as empty", () => {
    expect(
      formatDiscoveryFailure({
        profileName: "Platform leadership",
        provider: "brave",
        errorSummary: "   ",
      }),
    ).toBe("Platform leadership did not finish. Review run history for details.");
  });
});
