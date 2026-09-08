import { CountryStateCity } from "@tansuasici/country-state-city/node";

import type { MatchableJob } from "@/contexts/discovery/domain/job-match";
import { resolveCountry } from "@/platform/locations/location-search.server";

type GeographicLocations = NonNullable<MatchableJob["geographicLocations"]>;

export function createListingGeographyResolver() {
  // Build the catalogue's index at application startup, before an evaluation begins.
  CountryStateCity.searchLocations("", { entityTypes: ["city", "state"], typoTolerance: false });
  const cache = new Map<string, GeographicLocations>();
  const places = new Map<string, ReturnType<typeof findPlaces>>();
  return (values: readonly string[]): GeographicLocations => {
    const locations = values.flatMap((value) => {
      const cached = cache.get(value);
      if (cached) return cached;
      const result = resolve(value, places);
      cache.set(value, result);
      return result;
    });
    return locations.filter(
      (location) =>
        !location.uncertain ||
        !locations.some((other) => !other.uncertain && other.terms[0] === location.terms[0]),
    );
  };
}

function resolve(
  value: string,
  places: Map<string, ReturnType<typeof findPlaces>>,
): GeographicLocations {
  const country = resolveCountry(value);
  if (country) return [{ terms: country.searchTerms, uncertain: false }];
  const [name = "", ...qualifiers] = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!name) return [];
  const key = normalize(name);
  const found = places.get(key) ?? findPlaces(name);
  places.set(key, found);
  const candidates = found.flatMap((place) => {
    const parent = CountryStateCity.getCountryByIso2(place.countryCode);
    if (!parent) return [];
    const countryTerms = resolveCountry(parent.name)?.searchTerms ?? [
      parent.name,
      parent.iso2,
      parent.iso3,
    ];
    if (
      !qualifiers.every((qualifier) =>
        [place.stateName, ...countryTerms].some((term) => normalize(term) === normalize(qualifier)),
      )
    )
      return [];
    return [
      {
        countryCode: place.countryCode,
        terms: [
          place.name,
          `${place.name}, ${parent.name}`,
          `${place.name}, ${place.stateName}, ${parent.name}`,
          ...countryTerms,
        ],
      },
    ];
  });
  const uncertain = new Set(candidates.map((place) => place.countryCode)).size > 1;
  return candidates.map((place) => ({ terms: place.terms, uncertain }));
}

function findPlaces(name: string) {
  return CountryStateCity.searchLocations(name, {
    entityTypes: ["city", "state"],
    typoTolerance: false,
    limit: Number.MAX_SAFE_INTEGER,
  })
    .filter(
      (place) =>
        (place.matchReason === "canonical-exact" || place.matchReason === "alias-exact") &&
        place.record.lifecycleStatus !== "historical",
    )
    .map((place) => ({
      name: place.name,
      stateName: place.stateName ?? place.name,
      countryCode: place.countryCode,
    }));
}

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLowerCase();
}
