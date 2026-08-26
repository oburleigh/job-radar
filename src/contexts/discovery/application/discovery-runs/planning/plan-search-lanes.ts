import type { ResolvedMarket } from "@/contexts/discovery/domain/market";

export const SEARCH_STRATEGIES = [
  "role-first",
  "location-first",
  "phrase",
  "relaxed-title",
] as const;

export type SearchStrategy = (typeof SEARCH_STRATEGIES)[number];
export type SearchLaneKind = "role" | "board-discovery" | "worldwide-remote";

export type QuerySource = {
  readonly atsType: string;
  readonly pattern: string;
};

export type SearchLane = {
  readonly source: QuerySource;
  readonly kind: SearchLaneKind;
  readonly market: ResolvedMarket;
  readonly titleTerms: readonly string[];
  readonly strategy: SearchStrategy | null;
};

type LaneSource = QuerySource & {
  readonly supportsBoardSync: boolean;
};

type SearchLaneCriteria = {
  readonly titleTerms: readonly string[];
  readonly markets: readonly ResolvedMarket[];
  readonly includeRemote: boolean;
};

export function planSearchLanes(
  criteria: SearchLaneCriteria,
  sources: readonly LaneSource[],
  strategies: readonly SearchStrategy[],
  worldwideRemoteTerms: readonly string[],
): SearchLane[] {
  const titleTerms = uniqueTerms(criteria.titleTerms);
  if (
    titleTerms.length === 0 ||
    criteria.markets.length === 0 ||
    sources.length === 0 ||
    strategies.length === 0
  ) {
    return [];
  }

  const roleLanes = sources.flatMap((source) =>
    criteria.markets.flatMap((market) =>
      strategies.map((strategy) => ({
        source: sourceIdentity(source),
        kind: "role" as const,
        market,
        titleTerms,
        strategy,
      })),
    ),
  );
  const remoteTerms = uniqueTerms(worldwideRemoteTerms);
  const remoteLanes =
    criteria.includeRemote && remoteTerms.length > 0
      ? sources.map((source) => ({
          source: sourceIdentity(source),
          kind: "worldwide-remote" as const,
          market: {
            scope: {
              key: "worldwide-remote",
              label: "Worldwide remote",
              terms: remoteTerms,
            },
            countryCode: null,
            searchLanguage: null,
          },
          titleTerms,
          strategy: null,
        }))
      : [];
  const boardLanes = sources
    .filter((source) => source.supportsBoardSync)
    .flatMap((source) =>
      criteria.markets.map((market) => ({
        source: sourceIdentity(source),
        kind: "board-discovery" as const,
        market,
        titleTerms: [] as readonly string[],
        strategy: null,
      })),
    );

  return [...roleLanes, ...remoteLanes, ...boardLanes];
}

function sourceIdentity(source: LaneSource): QuerySource {
  return { atsType: source.atsType, pattern: source.pattern };
}

function uniqueTerms(terms: readonly string[]): string[] {
  return [...new Set(terms.map((term) => term.trim()).filter(Boolean))];
}
