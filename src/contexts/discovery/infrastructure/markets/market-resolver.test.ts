import { describe, expect, it } from "vitest";

import { createMarketResolver } from "./market-resolver";

const vocabulary = {
  markets: [
    {
      key: "country:AE",
      aliases: ["UAE"],
      covers: ["subdivision:AE-AZ", "subdivision:AE-DU"],
      searchLanguage: "en",
    },
    {
      key: "subdivision:AE-AZ",
      label: "Abu Dhabi",
      aliases: [],
    },
    {
      key: "subdivision:AE-DU",
      label: "Dubai",
      aliases: [],
    },
  ],
} as const;

describe("market resolution", () => {
  it("expands a country name or alias to its configured vocabulary and descendants", () => {
    const resolver = createMarketResolver(vocabulary);

    const expected = {
      scope: {
        key: "country:AE",
        label: "United Arab Emirates",
        terms: ["United Arab Emirates", "UAE", "Abu Dhabi", "Dubai"],
      },
      countryCode: "AE",
      searchLanguage: "en",
    };

    expect(resolver.resolve("United Arab Emirates")).toEqual(expected);
    expect(resolver.resolve("  uae ")).toEqual(expected);
  });

  it("keeps a subdivision target narrow", () => {
    const resolver = createMarketResolver(vocabulary);

    expect(resolver.resolve("Dubai")).toEqual({
      scope: {
        key: "subdivision:AE-DU",
        label: "Dubai",
        terms: ["Dubai"],
      },
      countryCode: "AE",
      searchLanguage: "en",
    });
  });

  it("keeps unknown text as one literal market", () => {
    const resolver = createMarketResolver(vocabulary);

    expect(resolver.resolve("  Seoul  ")).toEqual({
      scope: {
        key: "literal:seoul",
        label: "Seoul",
        terms: ["Seoul"],
      },
      countryCode: null,
      searchLanguage: null,
    });
  });
});
