import { describe, expect, it } from "vitest";

import { targetLocationOptions } from "./target-location-catalogue";

describe("target location catalogue", () => {
  it("maps configured market vocabulary into display labels without embedding a presentation catalogue", () => {
    expect(
      targetLocationOptions({
        markets: [
          { key: "country:GB" },
          { key: "subdivision:GB-LND", label: "Greater London" },
          { key: "region:west-midlands", label: "West Midlands" },
        ],
      }),
    ).toEqual([
      { key: "country:GB", label: "United Kingdom of Great Britain and Northern Ireland" },
      { key: "subdivision:GB-LND", label: "Greater London" },
      { key: "region:west-midlands", label: "West Midlands" },
    ]);
  });
});
