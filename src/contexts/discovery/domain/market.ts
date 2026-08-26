export type MarketScope = {
  readonly key: string;
  readonly label: string;
  readonly terms: readonly string[];
};

export type ResolvedMarket = {
  readonly scope: MarketScope;
  readonly countryCode: string | null;
  readonly searchLanguage: string | null;
};
