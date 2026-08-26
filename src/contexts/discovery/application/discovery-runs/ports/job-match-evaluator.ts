import type { MarketScope } from "@/contexts/discovery/domain/market";

export type ResolvedMatchMarkets = {
  readonly marketScopes: readonly MarketScope[];
  readonly excludedMarketScopes: readonly MarketScope[];
};

export interface JobMatchEvaluator {
  readonly evaluate: (
    profileId: number,
    markets: ResolvedMatchMarkets,
    onBatch: () => void,
    beforeBatch?: () => void,
  ) => Promise<{ readonly matched: number }>;
}
