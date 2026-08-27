import countryToCurrency from "country-to-currency";
import { iso31661, iso31662 } from "iso-3166";

import type { TargetLocationOption } from "@/contexts/recruiter-engagement/application/research-runs/target-locations";

export type ConfiguredMarketVocabulary = {
  readonly markets: readonly {
    readonly key: string;
    readonly label?: string | undefined;
  }[];
};

export function targetLocationOptions(
  vocabulary: ConfiguredMarketVocabulary,
): readonly TargetLocationOption[] {
  const labels = new Set<string>();
  return vocabulary.markets.flatMap((market) => {
    const label = labelFor(market);
    if (!label || labels.has(label.toLocaleLowerCase())) {
      return [];
    }
    labels.add(label.toLocaleLowerCase());
    return [{ key: market.key, label }];
  });
}

function labelFor(market: ConfiguredMarketVocabulary["markets"][number]): string | undefined {
  if (market.key.startsWith("country:")) {
    const countryCode = market.key.slice("country:".length);
    if (!Object.hasOwn(countryToCurrency, countryCode)) {
      return undefined;
    }
    return iso31661.find((country) => country.alpha2 === countryCode)?.name;
  }
  if (market.key.startsWith("subdivision:")) {
    const code = market.key.slice("subdivision:".length);
    return market.label ?? iso31662.find((subdivision) => subdivision.code === code)?.name;
  }
  return market.label;
}
