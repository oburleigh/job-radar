import { describe, expect, it } from "vitest";

import { jobListingIdFrom, searchProfileIdFrom } from "./identifiers";

describe.each([
  ["search profile", searchProfileIdFrom],
  ["job listing", jobListingIdFrom],
] as const)("%s identifier", (_label, createIdentifier) => {
  it("accepts positive safe integers", () => {
    expect(createIdentifier(1)).toBe(1);
    expect(createIdentifier(Number.MAX_SAFE_INTEGER)).toBe(Number.MAX_SAFE_INTEGER);
  });

  it.each([0, -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])(
    "rejects %s",
    (value) => {
      expect(createIdentifier(value)).toBeNull();
    },
  );
});
