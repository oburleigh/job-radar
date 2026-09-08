import {
  type City,
  type Country,
  CountryStateCity,
  type State,
  toPublicId,
} from "@tansuasici/country-state-city/node";

import type { LocationOption } from "@/platform/http/location-option";

export type { LocationOption } from "@/platform/http/location-option";

type RankedOption = {
  readonly canonicalLabel: string;
  readonly kindRank: number;
  readonly matchRank: number;
  readonly option: LocationOption;
};

const countries = CountryStateCity.getAllCountries() as Country[];
const countryAliases = new Map(
  countries.flatMap((country) => aliases(country).map((alias) => [normalise(alias), country])),
);
const resolvedLocations = new Map<string, LocationOption | null>();

export function resolveCountry(value: string): LocationOption | null {
  const country = countryAliases.get(normalise(value));
  return country ? countryOption(country) : null;
}

export function searchLocations(query: string, requestedLimit = 50): readonly LocationOption[] {
  const exactCountry = countryAliases.get(normalise(query));
  if (exactCountry) {
    return [countryOption(exactCountry)];
  }
  if (!query.trim()) {
    return countries
      .toSorted((left, right) => left.name.localeCompare(right.name))
      .map(countryOption);
  }
  const limit = Math.max(1, Math.min(50, requestedLimit));
  const target = normalise(query);
  const ranked = [
    ...CountryStateCity.searchCountries(query).map(countryOption),
    ...CountryStateCity.searchStates(query)
      .filter((state) => state.lifecycleStatus !== "historical")
      .map(stateOption),
    ...CountryStateCity.searchCities(query)
      .filter((city) => city.lifecycleStatus !== "historical")
      .map(cityOption),
  ]
    .map((option) => rankOption(option, target))
    .toSorted(
      (left, right) =>
        left.matchRank - right.matchRank ||
        left.kindRank - right.kindRank ||
        left.option.label.localeCompare(right.option.label),
    );

  const preferred = new Map<string, RankedOption>();
  for (const candidate of ranked) {
    const incumbent = preferred.get(candidate.canonicalLabel);
    if (incumbent === undefined || (incumbent.option.kind !== "city" && isCity(candidate))) {
      preferred.set(candidate.canonicalLabel, candidate);
    }
  }
  const chosen = new Set(preferred.values());
  return ranked
    .filter((candidate) => chosen.has(candidate))
    .slice(0, limit)
    .map((candidate) => candidate.option);
}

export function resolveLocations(values: readonly string[]): readonly LocationOption[] {
  return values.flatMap((value) => {
    const key = normalise(value);
    const cached = resolvedLocations.get(key);
    if (cached !== undefined) {
      return cached ? [cached] : [];
    }
    const exactCountry = countryAliases.get(key);
    if (exactCountry) {
      const option = countryOption(exactCountry);
      resolvedLocations.set(key, option);
      return [option];
    }
    const query = value.split(",", 1)[0] ?? value;
    const option = searchLocations(query, 50).find((candidate) =>
      sameLocationLabel(candidate.label, value),
    );
    resolvedLocations.set(key, option ?? null);
    return option ? [option] : [];
  });
}

function countryOption(country: Country): LocationOption {
  return {
    countryCode: country.iso2,
    detail: `Country · ${country.iso2}`,
    id: `csc:country:${country.id}`,
    kind: "country",
    label: country.name,
    searchTerms: aliases(country),
  };
}

function stateOption(state: State): LocationOption {
  return {
    countryCode: state.countryCode,
    detail: `Administrative area · ${state.countryCode}`,
    id: toPublicId("state", state.id),
    kind: "administrative-area",
    label: `${state.name}, ${state.countryName}`,
    searchTerms: [state.name],
  };
}

function cityOption(city: City): LocationOption {
  const label =
    city.name === city.stateName
      ? `${city.name}, ${city.countryName}`
      : `${city.name}, ${city.stateName}, ${city.countryName}`;
  return {
    countryCode: city.countryCode,
    detail: `City · ${city.countryCode}`,
    id: toPublicId("city", city.id),
    kind: "city",
    label,
    searchTerms: [city.name],
  };
}

function rankOption(option: LocationOption, target: string): RankedOption {
  const candidate = normalise(option.searchTerms[0] ?? option.label);
  return {
    canonicalLabel: canonicalLocationLabel(option.label),
    kindRank: kindRank(option),
    matchRank: candidate === target ? 0 : candidate.startsWith(target) ? 1 : 2,
    option,
  };
}

function isCity(candidate: RankedOption): boolean {
  return candidate.option.kind === "city";
}

function sameLocationLabel(left: string, right: string): boolean {
  return canonicalLocationLabel(left) === canonicalLocationLabel(right);
}

function canonicalLocationLabel(value: string): string {
  const collapsed = value
    .split(",")
    .map((part) => part.trim())
    .filter((part, index, parts) => {
      const previous = parts[index - 1];
      return previous === undefined || normalise(part) !== normalise(previous);
    })
    .join(", ");
  return normalise(collapsed);
}

function aliases(country: Country): readonly string[] {
  const words = country.name
    .split(/[^\p{L}\p{N}]+/u)
    .filter((word) => !/^(?:and|of|the)$/i.test(word));
  const acronym = words.length > 1 ? words.map((word) => word[0]).join("") : "";
  return [
    ...new Set(
      [
        country.name,
        country.iso2,
        country.iso3,
        acronym,
        country.tld.slice(1).toUpperCase(),
        country.name.replace(/\bSaint\b/g, "St"),
      ].filter(Boolean),
    ),
  ];
}

function kindRank(option: LocationOption): number {
  return option.kind === "country" ? 0 : option.kind === "administrative-area" ? 1 : 2;
}

function normalise(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim()
    .toLocaleLowerCase();
}
