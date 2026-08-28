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
