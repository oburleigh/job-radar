# Market-aware discovery design

Status: Accepted on 2026-08-25

Job Radar will resolve each saved profile location through one market vocabulary before it plans searches or matches jobs. A profile that contains only `United Arab Emirates` will search and match `United Arab Emirates`, `UAE`, Dubai, and Abu Dhabi. A profile that contains `Dubai` will stay limited to Dubai.

This design covers the market, query-strategy, provider-geography, adaptive-pagination, and run-evidence work tracked in ADM-100. It preserves existing profile records and keeps unknown location text usable.

## Decision

Keep `search_profiles.location_terms` and `excluded_location_terms` as user-entered strings. Resolve those strings at the infrastructure boundary into typed `MarketScope` values. Pass the same resolved scopes to application query planning and domain matching.

Add [`iso-3166` version 4.4.0](https://www.npmjs.com/package/iso-3166) as server-side reference data for ISO 3166-1 countries and ISO 3166-2 subdivisions. The package is ESM-only, includes TypeScript declarations, has no dependencies, and uses the MIT license. It is compatible with Job Radar's Node 24 ESM runtime.

The package does not own product policy. SQLite configuration owns common aliases, covered descendants, search languages, provider location labels, and request budgets. ISO data validates codes and supplies standard names. Contract tests pin the country and subdivision records that Job Radar relies on because the package derives its machine-readable data from public sources rather than an ISO feed.

## Current behavior to preserve

The current system has four observable behaviors that will receive characterisation tests before changes begin:

- A profile location is stored as trimmed free text.
- Query planning places all saved locations in one OR clause for every title and source.
- Matching accepts a job only when its normalized location contains one saved location string.
- Unknown location strings work as narrow literal values.

ADM-100 changes the second and third behaviors for configured markets. Storage and literal fallback remain compatible.

## Scope

The change will:

- resolve country, subdivision, city, and literal targets;
- use one resolved scope for retrieval and matching;
- plan independent search lanes for each target market;
- measure role-first, location-first, phrase, and relaxed-title strategies;
- pass country, language, location, and page through a provider-neutral application contract;
- continue pagination only while the provider and productivity policy allow it;
- record market, locale, strategy, page, results, and useful hits for every request;
- expose the new request evidence in run details and the discovery benchmark;
- edit market policy through Settings;
- retain worldwide-remote searches as a separate scope.

The change will not migrate profile rows to market IDs, add geocoding, infer a market from coordinates, or build a global city database. Known-board-first scheduling remains separate work.

## Market language

`MarketScope` is the resolved search and matching boundary. It has this shape:

```ts
type MarketScope = {
  readonly key: string;
  readonly kind: "country" | "subdivision" | "city" | "literal";
  readonly label: string;
  readonly countryCode: string | null;
  readonly searchLanguage: string | null;
  readonly providerLocation: string | null;
  readonly queryTerms: readonly string[];
  readonly matchTerms: readonly string[];
};
```

A country scope contains its standard names, configured aliases, and the names and aliases of configured descendants. A subdivision or city scope contains only its own names and aliases. It never inherits its parent's other descendants. A literal scope contains the saved text as its only query and match term, with no country or provider location.

The same rule applies to excluded locations. Excluding a configured country excludes its configured descendants. Excluding a city does not exclude sibling cities.

`MarketScope` belongs in the domain because it expresses matching meaning without knowing SQLite, Zod, ISO packages, or provider parameter names. Infrastructure maps validated configuration and ISO records into this type.

## SQLite-backed market policy

Runtime settings gain a `marketVocabulary` section. The infrastructure schema validates it with Zod and cross-checks every ISO code against `iso-3166`. Validation rejects duplicate keys, duplicate normalized aliases, missing descendants, descendant cycles, country mismatches, invalid language tags, and unsupported ISO codes.

The initial setting will cover the markets needed by the accepted benchmark. A representative fragment is:

```json
{
  "defaultSearchLanguage": "en",
  "markets": [
    {
      "key": "country:AE",
      "kind": "country",
      "countryCode": "AE",
      "aliases": ["UAE"],
      "covers": ["subdivision:AE-AZ", "subdivision:AE-DU"],
      "searchLanguage": "en",
      "providerLocation": "United Arab Emirates"
    },
    {
      "key": "subdivision:AE-AZ",
      "kind": "subdivision",
      "subdivisionCode": "AE-AZ",
      "aliases": ["Abu Dhabi"],
      "covers": [],
      "searchLanguage": "en",
      "providerLocation": "Abu Dhabi, United Arab Emirates"
    },
    {
      "key": "subdivision:AE-DU",
      "kind": "subdivision",
      "subdivisionCode": "AE-DU",
      "aliases": ["Dubai"],
      "covers": [],
      "searchLanguage": "en",
      "providerLocation": "Dubai, United Arab Emirates"
    }
  ]
}
```

Standard ISO names are derived rather than copied into configuration. Aliases and coverage are operator-owned product policy.

A configured city uses a stable operator key, a label, an ISO country code, aliases, and a provider location. Cities are validated against their country relationship but are not treated as ISO subdivisions. This keeps the model open to cities that have no subdivision code without adding a global city dataset.

Bootstrap inserts the default setting when it is absent and preserves an existing value. Schema migrations contain only schema changes, so the repository's schema-only migration guard continues to pass.

Settings will expose the policy in a dedicated JSON editor with its current value, a format example, server-side validation, a field-specific error, pending feedback, and no partial save. This is an operator surface for a local single-user application, not a general place-search interface. ISO data stays on the server and does not enter the client bundle.

## Resolution data flow

The infrastructure configuration adapter creates a `MarketResolver` from the parsed SQLite policy and ISO reference data. Resolution is deterministic and case-insensitive after the same normalization used by matching.

For a discovery run:

1. `DiscoverySetupReader` loads the saved profile and resolves target and excluded location strings.
2. The application receives the original profile criteria plus resolved market scopes.
3. Query planning builds independent lanes from the target scopes.
4. `JobMatchEvaluator` resolves the latest saved profile through the same resolver before evaluating jobs.
5. The domain matcher tests normalized job locations against `MarketScope.matchTerms`.

The profile may change between retrieval and final matching, as it can today. Both paths still use the same vocabulary contract and current policy.

## Provider-free search lanes

The application plan stops carrying a provider-rendered query as its primary contract. It describes intent:

```ts
type SearchLane = {
  readonly source: QuerySource;
  readonly market: MarketScope;
  readonly strategy: SearchStrategy;
  readonly titleTerms: readonly string[];
};

type SearchStrategy =
  | "role-first"
  | "location-first"
  | "phrase"
  | "relaxed-title"
  | "board-discovery"
  | "worldwide-remote";
```

One lane groups all profile titles for one source, market, and strategy. This removes the current title-by-source multiplication. The provider adapter renders the query syntax and request parameters from the lane. The application does not select `country`, `gl`, `hl`, `offset`, `start`, or any other vendor field.

The four measured role strategies differ as follows:

| Strategy | Intent |
| --- | --- |
| `role-first` | Put grouped role terms before market terms and prefer provider title constraints. |
| `location-first` | Put market terms before grouped role terms. |
| `phrase` | Search grouped exact title phrases with market terms. |
| `relaxed-title` | Search significant title tokens without requiring every token in the page title. |

`board-discovery` remains location-led and applies only to sources that support board synchronization. `worldwide-remote` remains separate from regional market lanes.

Strategy order, enabled strategies, maximum requests per run, maximum pages per lane, and minimum useful hits required for another page are SQLite-backed discovery settings. These values are visible in Settings.

## Provider adapters own geography and pagination

The application search port accepts a provider-neutral request with the lane, one-based page number, result limit, freshness, and abort signal. The adapter prepares its rendered query. The application journals that prepared request before execution, then asks the adapter to execute it and return:

```ts
type SearchPage = {
  readonly results: readonly SearchResult[];
  readonly hasMore: boolean;
};
```

Adapters map the neutral fields according to their supported contracts:

| Provider | Geography and language | Pagination evidence |
| --- | --- | --- |
| Brave | `country`, `search_lang`, and `ui_lang` where configured | `offset` and `query.more_results_available` |
| SerpAPI | `location`, `gl`, and `hl` | `start` and returned pagination metadata |
| Serper | Supported country and language request fields | Supported page field and returned page evidence |

Brave documents a two-character country code, search language, zero-based offset, and `more_results_available` for deciding whether to request another page: <https://api-dashboard.search.brave.com/app/documentation/web-search/get-started>. SerpAPI documents `location`, `gl`, `hl`, `start`, and its pagination links: <https://serpapi.com/search-api>. Serper's adapter will receive focused contract tests for its current request and response fields before production behavior changes.

When an adapter does not support a neutral field, it omits the vendor parameter but retains market terms in the rendered query. It must not invent a default country that changes the requested market.

## Adaptive execution

The discovery use case executes the first page of each planned lane. It requests another page only when all of these conditions hold:

- the provider returned `hasMore: true`;
- the completed page met `minimumUsefulHitsPerPage`;
- the lane has not reached `maxPagesPerLane`;
- the run has not reached `maxRequestsPerRun`;
- the run has not been cancelled or stopped by provider failure.

A useful hit is a newly inserted search result that produces a supported classified posting, discovers a synchronizable board, or writes a job. `JobDiscoveryCatalog.recordHit` returns this decision so the application can count it without learning classification or persistence details.

The global request budget is deterministic. Lanes execute in configured strategy order and source priority. When the budget ends, the run records the budget stop reason and no more requests are admitted. Provider failure keeps the existing fatal/transient behavior and stops remaining work for that provider.

## Every request is journaled

Each provider request, including every page, owns one `discovery_queries` row. The table gains additive columns for:

- market key and label;
- country code and search language;
- strategy and page;
- result count and unique useful hit count;
- whether the provider reported more results.

The existing query text, source, status, error, and timing fields remain. `hit_count` becomes the result count exposed by read models, with a compatibility path for old rows.

The journal will append requests as lanes and pages are admitted rather than inserting every possible page up front. `discovery_runs.query_count` tracks admitted requests. A planned lane skipped by the global budget receives a cancelled request record only when it had already been admitted; the run summary also reports the budget stop reason.

Run details group request evidence by market, strategy, and source. The discovery benchmark reads the same rows to calculate request totals and productive-query rates.

## Errors remain actionable

Invalid market configuration fails at the configuration boundary with the exact setting path. The Settings action leaves the previous SQLite value intact and returns the error beside the market editor.

An unknown saved profile location does not fail a run. It becomes a literal scope and is journaled with a null country and language when no default language applies.

An adapter response without required pagination evidence is rejected by its Zod response schema. A provider that explicitly reports no continuation ends the lane successfully. Query failures retain their rendered query, market, strategy, page, and error in the journal.

## Acceptance evidence

The implementation must add tests at each owner boundary.

Domain tests will prove that a UAE country scope matches `UAE`, `United Arab Emirates`, Dubai, and Abu Dhabi; a Dubai scope rejects Abu Dhabi; exclusions use the same hierarchy; and literal scopes preserve current substring behavior.

Application tests will prove that planning groups titles by source and market, emits all four measured strategies, keeps remote work separate, respects deterministic budgets, advances only productive lanes with provider continuation, and stops unproductive or exhausted lanes.

Infrastructure tests will prove configuration validation, ISO record assumptions, bootstrap preservation, empty and existing database migration, provider parameter mapping, provider continuation parsing, journal persistence, and run-detail presentation.

The deterministic discovery corpus will change its UAE profiles to store only the country target. It will include UAE-labelled, full-country-labelled, Dubai, and Abu Dhabi positives plus a Dubai-only profile with an Abu Dhabi negative. Its report must show:

- every active profile meeting at least 90 percent recall and 80 percent top-20 precision;
- at least 70 percent fewer requests than the 370-query Asia baseline, which means no more than 111 requests;
- at least 10 percent productive local-market queries for the Asia case;
- request results grouped by market, locale, strategy, and page.

Focused mutation testing will cover the new market-resolution, planning, and pagination decisions. The final tree must pass the repository's lint, type check, unit tests, browser tests, build, discovery benchmark, and read-only Claude Opus review.

## Delivery slices

Implementation will proceed as small vertical slices:

1. Characterise literal planning and matching.
2. Add ISO-backed market policy parsing and resolution with literal fallback.
3. Pass resolved scopes through query planning and matching.
4. Add semantic strategies and provider geography.
5. Add adaptive pages and useful-hit accounting.
6. Persist and present per-request evidence.
7. Update the benchmark and tune configured budgets against its fixed targets.
8. Run mutation testing, the full gate, and the required independent review.

Each slice begins with a failing behavior test and ends with its focused checks green.

## Alternatives considered

Migrating profile locations to canonical market IDs would remove resolution at run time, but it requires a data migration, changes the profile editor contract, and risks blocking existing custom values. It is not needed for the accepted behavior.

Using `i18n-iso-countries` would provide country aliases and translations, but it does not provide ISO subdivisions. The chosen `iso-3166` package fits the country and subdivision validation job with no transitive dependencies. Product aliases such as `UAE` still belong in SQLite.

The older `iso-3166-2` package was rejected because its latest npm release is nine years old and npm declares no license. A hand-maintained country and subdivision table was rejected because Job Radar would own standards updates that a maintained package already supplies.

Keeping separate alias expansion in the planner and matcher was rejected because the two paths could disagree. The shared resolved scope is the contract that prevents a retrieved role from being discarded under a narrower vocabulary.
