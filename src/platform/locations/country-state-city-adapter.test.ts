import { describe, expect, it } from "vitest";

import { resolveLocations, searchLocations } from "./location-search.server";

describe("country state city location catalogue adapter", () => {
  it.each([
    ["UK", "United Kingdom", "GB"],
    ["GB", "United Kingdom", "GB"],
    ["GBR", "United Kingdom", "GB"],
    ["UAE", "United Arab Emirates", "AE"],
    ["AE", "United Arab Emirates", "AE"],
    ["ARE", "United Arab Emirates", "AE"],
    ["SA", "Saudi Arabia", "SA"],
    ["SK", "Slovakia", "SK"],
  ])("resolves the country alias %s before similarly named cities", (query, label, code) => {
    expect(searchLocations(query, 5)[0]).toMatchObject({
      countryCode: code,
      kind: "country",
      label,
    });
  });

  it("searches countries, administrative areas, and cities with stable identities", () => {
    const results = searchLocations("Dubai", 10);

    expect(results).toEqual([
      expect.objectContaining({
        id: "csc:city:32",
        kind: "city",
        label: "Dubai, United Arab Emirates",
      }),
    ]);
    expect(new Set(results.map((result) => result.label)).size).toBe(results.length);
  });

  it("keeps a distinct administrative-area match ahead of a partial city match", () => {
    expect(searchLocations("Abu Dhabi", 10)[0]).toMatchObject({
      kind: "administrative-area",
      label: "Abu Dhabi Emirate, United Arab Emirates",
    });
  });

  it("searches cities without maintaining a local city list", () => {
    expect(searchLocations("London", 20)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "city",
          label: "London, England, United Kingdom",
        }),
      ]),
    );
  });

  // Every keystroke reaches this search, so the first letter of a country is the hot path and it
  // carries the widest candidate set in the catalogue.
  it.each(["Ger", "G", "e", "a"])("answers the prefix %s without a quadratic scan", (query) => {
    const started = performance.now();
    const results = searchLocations(query);
    const elapsed = performance.now() - started;

    expect(results.length).toBe(50);
    // A quadratic scan of this candidate set takes tens of minutes, so a generous bound still
    // fails by three orders of magnitude if one returns.
    expect(elapsed).toBeLessThan(5_000);
  });

  it("keeps one option per equivalent label and prefers the city", () => {
    const results = searchLocations("Singapore", 10);
    const labels = results.map((result) => result.label);

    expect(new Set(labels).size).toBe(labels.length);
    expect(results.filter((result) => result.label === "Singapore").length).toBeLessThan(2);
  });

  it("offers the complete alphabetic country catalogue for browsing", () => {
    const results = searchLocations("");

    expect(results.length).toBeGreaterThan(200);
    expect(results[0]).toMatchObject({ kind: "country", label: "Afghanistan" });
    expect(results).toEqual(
      expect.arrayContaining([expect.objectContaining({ kind: "country", label: "Zambia" })]),
    );
    expect(results.every((option) => option.kind === "country")).toBe(true);
  });

  it("canonicalises submitted labels and rejects values outside the catalogue", () => {
    expect(
      resolveLocations(["uae", "Dubai, Dubai, United Arab Emirates", "not a real location"]),
    ).toEqual([
      expect.objectContaining({ label: "United Arab Emirates" }),
      expect.objectContaining({
        id: "csc:city:32",
        kind: "city",
        label: "Dubai, United Arab Emirates",
      }),
    ]);
  });
});
