# Market-aware discovery design

Status: Accepted for planning on 2026-08-25

Job Radar will resolve saved location text through one market vocabulary before retrieval, classification, matching, and exclusion. A profile with only `United Arab Emirates` will search and match the country name, `UAE`, Dubai, and Abu Dhabi. A profile with `Dubai` will stay limited to Dubai.

This design covers ADM-100. It keeps existing profile records valid, reduces duplicate requests, and makes every provider request measurable.

## Decision

Keep `search_profiles.location_terms` and `excluded_location_terms` as user-entered strings. An infrastructure `MarketResolver` maps them to a small domain value:

```ts
type MarketScope = {
  readonly key: string;
  readonly label: string;
  readonly terms: readonly string[];
};
```

`terms` is the only expansion used by query rendering, matching, exclusion, classification, and location-hint inference. A country contains its standard names, configured aliases, and configured descendants. A subdivision or city contains only its own label and aliases. Unknown text becomes a literal scope with one term.

Add [`iso-3166` 4.4.0](https://www.npmjs.com/package/iso-3166) as server-only reference data. It validates country and subdivision codes and supplies country names. It has TypeScript declarations, no dependencies, and an MIT license. Subdivision and city labels remain explicit configuration because ISO subdivision names may use forms unsuitable for search, such as `Dubayy` for `AE-DU`.

## Market policy stays in SQLite

The `marketVocabulary` runtime setting owns aliases, country coverage, display labels, and search languages. Keys encode their type and code, so the setting does not repeat those fields:

```json
{
  "markets": [
    {
      "key": "country:AE",
      "aliases": ["UAE"],
      "covers": ["subdivision:AE-AZ", "subdivision:AE-DU"],
      "searchLanguage": "en"
    },
    {
      "key": "subdivision:AE-AZ",
      "label": "Abu Dhabi",
      "aliases": []
    },
    {
      "key": "subdivision:AE-DU",
      "label": "Dubai",
      "aliases": []
    }
  ]
}
```

Country labels come from ISO data. Subdivisions and cities require an operator label. They derive their country code and search language from their country entry; an unresolved language is null. Country entries may cover subdivisions or cities in the same country; those entries cannot cover other markets. Validation rejects invalid keys or language tags, unknown ISO codes, missing covered markets, cross-country coverage, and duplicate normalized labels or aliases.

Provider location strings stay with provider configuration:

```json
{
  "marketLocations": {
    "country:AE": "United Arab Emirates",
    "subdivision:AE-AZ": "Abu Dhabi, United Arab Emirates",
    "subdivision:AE-DU": "Dubai, United Arab Emirates"
  }
}
```

Bootstrap inserts defaults only when a setting is absent. Settings exposes both values as validated JSON and keeps the previous value after a failed save. ISO data never enters the browser bundle.

## One resolution feeds every consumer

`DiscoverySetupReader` returns each target as its `MarketScope`, country code, and search language, and returns exclusions as scopes. The application passes that resolved setup through the full discovery run:

1. The planner uses the scopes to create market-specific search lanes.
2. Provider adapters render queries from the same terms.
3. `JobDiscoveryCatalog.recordHit` receives the resolved scope and uses its terms for classification and `inferLocationHint`.
4. `JobMatchEvaluator` uses the latest resolved target and excluded scopes for final matching.

This closes the current gap where retrieval, matching, and location-hint inference interpret profile locations separately. Characterisation tests will first pin the existing literal behavior.

## Search lanes express intent

The application plans one lane per source, market, and strategy. Titles are grouped within a lane instead of multiplying titles by sources.

```ts
type SearchStrategy =
  | "role-first"
  | "location-first"
  | "phrase"
  | "relaxed-title";

type SearchLaneKind = "role" | "board-discovery" | "worldwide-remote";

type SearchLane = {
  readonly source: QuerySource;
  readonly kind: SearchLaneKind;
  readonly market: MarketScope;
  readonly countryCode: string | null;
  readonly searchLanguage: string | null;
  readonly titleTerms: readonly string[];
  readonly strategy: SearchStrategy | null;
};
```

The four role strategies change query ordering or title strictness. Board discovery and worldwide remote are separate lane kinds and do not appear in strategy measurements.

An ordered `strategies` setting replaces both global and provider `titleSearchMode`. Legacy `title` maps to `role-first`, `location-first`, and `phrase`; legacy `anywhere` maps to `relaxed-title`; a null provider value inherits the global strategies. New defaults and the benchmark enable all four. Settings writes only the new form. Provider `parameters` must reject geography and pagination keys owned by the adapter, so free-form values cannot override lane intent.

## Adapters own provider syntax

The application supplies a lane, one-based page, limit, and freshness. A provider first prepares a request, exposing only the rendered query and an execution function. The application journals the request before calling that function and passes the abort signal at execution.

```ts
type SearchPage = {
  readonly results: readonly SearchResult[];
  readonly hasMore: boolean;
};

type PreparedSearchRequest = {
  readonly renderedQuery: string;
  readonly execute: (signal: AbortSignal) => Promise<SearchPage>;
};
```

`JsonSearchProvider` implements the same contract so fixtures exercise the real planner and journal path. Vendor parameters do not escape the adapter.

| Provider | Geography and language | Page and continuation |
| --- | --- | --- |
| Brave | `country`, `search_lang`, `ui_lang` | zero-based `offset`; `query.more_results_available` |
| SerpAPI | `location`, `gl`, `hl` | `start`; returned next-page metadata |
| Serper | adapter-supported country and language fields | current page field; explicit response evidence when present |

Focused adapter tests will pin Serper's current request and response fields before its behavior changes. When a provider omits explicit continuation evidence, the safe fallback is `results.length === requestedLimit`. Missing evidence does not invalidate an otherwise valid response.

An adapter omits an unsupported geography or language field and never substitutes another market.

The first page of each lane always runs. Another page is admitted only when `hasMore` is true, the previous page produced at least `minimumUsefulHitsPerPage`, the lane remains below `maxPagesPerLane`, and the run remains below `maxRequestsPerRun`. These budgets are SQLite-backed discovery settings exposed in Settings.

A useful hit is a newly inserted result that creates a supported classified posting, discovers a synchronizable board, or writes a job. Extend `RecordedDiscoveryHit` with `isUseful` so `JobDiscoveryCatalog.recordHit` returns that decision. Lanes run in configured strategy and source order, which makes budget decisions deterministic.

## Journal actual requests

Each admitted provider request owns one `discovery_queries` row. Keep the existing `hit_count` as the raw result count. Add nullable fields for `market_key`, `country_code`, `search_language`, `lane_kind`, `strategy`, `page`, `useful_hit_count`, and `has_more`.

Replace the journal's up-front `queryCount` and bulk `planQueries` inputs with a run start followed by `admitRequest`; admission increments `discovery_runs.query_count` in the same transaction. `cancelPlannedQueries` narrows to admitted pending rows because unadmitted pages no longer exist. The run summary records a budget stop reason, and the UI will say `requests` instead of `role-title queries`.

The existing non-null `ats_type` and `source_pattern` columns keep their source metadata. `title_term` stores the grouped title display text and is empty for lanes without titles.

Match and exclusion reasons record the actual matched term from `MarketScope.terms`. Run details group request evidence by market, locale, lane, strategy, source, and page.

## Benchmark uses the production path

The deterministic discovery benchmark will use an in-memory SQLite database and a fixture-backed `SearchProvider` to run the real planner, discovery use case, catalog, and journal. Direct fixture insertion cannot prove the ADM-100 request budget or productivity contract.

The checked-in Asia fixture will include the exact profile, sources, and legacy planner inputs that produce the accepted 370-request baseline. Its baseline file records the expected count and the pre-ADM-100 formula used to derive it. The new benchmark must show:

- every active profile reaches at least 90 percent recall and 80 percent top-20 precision;
- the Asia run admits no more than 111 requests, a reduction of at least 70 percent;
- all four role strategies appear in completed journal rows;
- productive local-market requests are at least 10 percent of completed role-lane requests with a non-null country code.

A productive local-market request has `useful_hit_count > 0`. The report reads request totals and grouping fields from `discovery_queries`, not parallel benchmark counters.

## Acceptance evidence

Tests must prove country expansion, city isolation, hierarchical exclusions, literal fallback, and the same terms reaching `recordHit`, `inferLocationHint`, and final matching. Application tests must cover grouped titles, every strategy, remote separation, deterministic budgets, productive continuation, unproductive stopping, and cancellation. Infrastructure tests must cover configuration, pinned ISO assumptions, adapter mapping, continuation parsing and fallback, journal persistence, and empty and existing database migration.

Focused mutation testing covers market resolution, lane planning, and pagination decisions. The final tree must pass:

```bash
pnpm lint
pnpm typecheck
pnpm test
PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm test:e2e
pnpm build
```

It must also pass the deterministic benchmark and the repository's read-only Claude Opus review.

## Boundaries

This work does not migrate profiles to market IDs, add geocoding, build a city database, or implement known-board-first scheduling. `i18n-iso-countries` was rejected because it lacks subdivisions. The old `iso-3166-2` package was rejected because its latest npm release is stale and npm declares no license. A hand-maintained ISO table would make Job Radar responsible for standards updates.
