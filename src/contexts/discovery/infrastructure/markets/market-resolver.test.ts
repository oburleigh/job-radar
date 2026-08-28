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
    {
      key: "city:KR:seoul",
      label: "Seoul",
      aliases: ["Seoul Capital Area"],
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

  it("resolves a labelled city without requiring a configured country entry", () => {
    const resolver = createMarketResolver(vocabulary);

    expect(resolver.resolve("Seoul Capital Area")).toEqual({
      scope: {
        key: "city:KR:seoul",
        label: "Seoul",
        terms: ["Seoul", "Seoul Capital Area"],
      },
      countryCode: "KR",
      searchLanguage: null,
    });
  });

  it("resolves unconfigured countries and cities through the shared catalogue", () => {
    const resolver = createMarketResolver(vocabulary);

    expect(resolver.resolve("United Kingdom")).toEqual({
      scope: {
        key: "csc:country:232",
        label: "United Kingdom",
        terms: ["United Kingdom", "GB", "GBR", "UK"],
      },
      countryCode: "GB",
      searchLanguage: null,
    });
    expect(resolver.resolve("Dubai, Dubai, United Arab Emirates")).toEqual({
      scope: {
        key: "csc:city:32",
        label: "Dubai, United Arab Emirates",
        terms: ["Dubai", "Dubai, United Arab Emirates"],
      },
      countryCode: "AE",
      searchLanguage: "en",
    });
  });

  it("keeps unknown text as one literal market", () => {
    const resolver = createMarketResolver(vocabulary);

    expect(resolver.resolve("Narnia")).toEqual({
      scope: {
        key: "literal:narnia",
        label: "Narnia",
        terms: ["Narnia"],
      },
      countryCode: null,
      searchLanguage: null,
    });
  });
});
