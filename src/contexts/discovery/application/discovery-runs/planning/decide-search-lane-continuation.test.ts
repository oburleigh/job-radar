import { describe, expect, it } from "vitest";

import { decideSearchLaneContinuation } from "./decide-search-lane-continuation";

const productivePage = {
  hasMore: true,
  usefulHitCount: 2,
  minimumUsefulHitsPerPage: 2,
  page: 1,
  maxPagesPerLane: 3,
  admittedRequestCount: 4,
  maxRequestsPerRun: 10,
} as const;

describe("search lane continuation", () => {
  it("continues when every provider, productivity, lane, and run boundary permits it", () => {
    expect(decideSearchLaneContinuation(productivePage)).toEqual({
      continue: true,
      stopReason: null,
    });
  });

  it("stops when the provider reports no continuation", () => {
    expect(decideSearchLaneContinuation({ ...productivePage, hasMore: false })).toEqual({
      continue: false,
      stopReason: "no-more-results",
    });
  });

  it("requires the useful-hit threshold inclusively", () => {
    expect(decideSearchLaneContinuation({ ...productivePage, usefulHitCount: 1 })).toEqual({
      continue: false,
      stopReason: "insufficient-useful-hits",
    });
    expect(decideSearchLaneContinuation({ ...productivePage, usefulHitCount: 2 })).toMatchObject({
      continue: true,
    });
  });

  it("stops at the inclusive lane page cap", () => {
    expect(decideSearchLaneContinuation({ ...productivePage, page: 3 })).toEqual({
      continue: false,
      stopReason: "max-pages-per-lane",
    });
    expect(decideSearchLaneContinuation({ ...productivePage, page: 2 })).toMatchObject({
      continue: true,
    });
  });

  it("stops at the inclusive run request cap", () => {
    expect(decideSearchLaneContinuation({ ...productivePage, admittedRequestCount: 10 })).toEqual({
      continue: false,
      stopReason: "max-requests-per-run",
    });
    expect(
      decideSearchLaneContinuation({ ...productivePage, admittedRequestCount: 9 }),
    ).toMatchObject({ continue: true });
  });
});
