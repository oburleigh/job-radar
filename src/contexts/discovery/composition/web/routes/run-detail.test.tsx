import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { STALE_DISCOVERY_RUN_CODE } from "@/contexts/discovery/domain/stale-discovery-run";

import RunDetailPage from "./run-detail";

describe("run detail page", () => {
  it("says why a run stopped rather than showing the recorded marker", () => {
    const html = render({ error: STALE_DISCOVERY_RUN_CODE });

    expect(html).toContain(
      "The local app stopped receiving progress from this discovery. Start a new run to retry.",
    );
    expect(html).not.toContain(STALE_DISCOVERY_RUN_CODE);
  });

  it("still shows a provider's own recorded failure verbatim", () => {
    expect(render({ error: "Serper.dev returned HTTP 503: upstream unavailable" })).toContain(
      "Serper.dev returned HTTP 503: upstream unavailable",
    );
  });
});

function render(overrides: { readonly error: string }): string {
  const loaderData = {
    run: {
      id: 41,
      profileId: 7,
      profileName: "Platform leadership",
      provider: "",
      status: "failed",
      outcome: "failed",
      phase: "known-boards",
      knownBoardCount: 2,
      knownBoardCompletedCount: 1,
      knownBoardSuccessCount: 1,
      activeBoardName: null,
      webCoverageStatus: "pending",
      queryCount: 0,
      hitCount: 0,
      boardsDiscovered: 0,
      jobsUpserted: 0,
      matchesFound: 0,
      queryErrorCount: 0,
      syncErrorCount: 0,
      startedAt: new Date("2026-09-03T09:00:00.000Z"),
      finishedAt: null,
      ...overrides,
    },
    queries: [],
    requestSummary: [],
    funnel: {
      providerHits: 0,
      classifiedCandidates: 0,
      verifiedJobs: 0,
      verificationOnlyCandidates: 0,
      staleOnlyCandidates: 0,
      otherExclusions: 0,
      finalMatches: 0,
    },
    pollIntervalMs: 3_000,
    requestedJobUrl: "",
    diagnostic: null,
    diagnosticError: null,
  };
  const router = createMemoryRouter(
    [{ id: "run-detail", path: "/runs/:runId", Component: RunDetailPage }],
    {
      initialEntries: ["/runs/41"],
      hydrationData: { loaderData: { "run-detail": loaderData } },
    },
  );

  return renderToStaticMarkup(<RouterProvider router={router} />);
}
