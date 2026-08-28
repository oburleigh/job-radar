import type { TargetLocationOption } from "@/contexts/recruiter-engagement/application/research-runs/target-locations";
import { resolveLocations } from "@/platform/locations/location-search.server";

export type ConfiguredMarketVocabulary = {
  readonly markets: readonly {
    readonly key: string;
    readonly label?: string | undefined;
  }[];
};

export function targetLocationOptions(
  vocabulary: ConfiguredMarketVocabulary,
): readonly TargetLocationOption[] {
  return resolveTargetLocationOptions(
    vocabulary.markets.map((market) =>
      market.key.startsWith("country:")
        ? market.key.slice("country:".length)
        : (market.label ?? ""),
    ),
  );
}

export function resolveTargetLocationOptions(
  values: readonly string[],
): readonly TargetLocationOption[] {
  return resolveLocations(values).map((location) => ({ key: location.id, label: location.label }));
}
