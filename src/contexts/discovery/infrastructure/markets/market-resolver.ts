import { iso31661, iso31662 } from "iso-3166";

import type {
  MarketVocabulary,
  MarketVocabularyEntry,
} from "@/contexts/discovery/application/runtime-settings/settings";
import type { ResolvedMarket } from "@/contexts/discovery/domain/market";

export interface MarketResolver {
  readonly resolve: (value: string) => ResolvedMarket;
}

export function createMarketResolver(vocabulary: MarketVocabulary): MarketResolver {
  const entries = new Map(vocabulary.markets.map((market) => [market.key, market]));
  const resolved = new Map(
    vocabulary.markets.map((market) => {
      const countryCode = countryCodeFor(market.key);
      const country = entries.get(`country:${countryCode}`);
      const label = labelFor(market);
      const terms =
        market.key.startsWith("country:") && market.covers
          ? uniqueTerms([
              label,
              ...market.aliases,
              ...market.covers.flatMap((key) => {
                const covered = entries.get(key);
                return covered ? [labelFor(covered), ...covered.aliases] : [];
              }),
            ])
          : uniqueTerms([label, ...market.aliases]);

      return [
        market.key,
        {
          scope: { key: market.key, label, terms },
          countryCode,
          searchLanguage: market.searchLanguage ?? country?.searchLanguage ?? null,
        } satisfies ResolvedMarket,
      ];
    }),
  );
  const byTerm = new Map<string, ResolvedMarket>();
  for (const entry of vocabulary.markets) {
    const market = resolved.get(entry.key);
    if (market) {
      for (const term of [market.scope.label, ...entry.aliases]) {
        byTerm.set(normalize(term), market);
      }
    }
  }

  return {
    resolve(value) {
      const label = value.trim();
      return (
        byTerm.get(normalize(label)) ?? {
          scope: {
            key: `literal:${normalize(label).replaceAll(" ", "-")}`,
            label,
            terms: [label],
          },
          countryCode: null,
          searchLanguage: null,
        }
      );
    },
  };
}

function labelFor(entry: MarketVocabularyEntry): string {
  if (entry.key.startsWith("country:")) {
    const code = entry.key.slice("country:".length);
    return iso31661.find((country) => country.alpha2 === code)?.name ?? entry.label ?? code;
  }
  if (entry.key.startsWith("subdivision:")) {
    const code = entry.key.slice("subdivision:".length);
    return entry.label ?? iso31662.find((subdivision) => subdivision.code === code)?.name ?? code;
  }
  return entry.label ?? entry.key;
}

function countryCodeFor(key: string): string | null {
  if (key.startsWith("country:")) {
    return key.slice("country:".length);
  }
  if (key.startsWith("subdivision:")) {
    return key.slice("subdivision:".length, "subdivision:".length + 2);
  }
  if (key.startsWith("city:")) {
    return key.slice("city:".length, "city:".length + 2);
  }
  return null;
}

function uniqueTerms(terms: readonly string[]): string[] {
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = normalize(term);
    if (!key || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase();
}
