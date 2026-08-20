# Job Radar

Job Radar is a local job discovery and triage app. It searches targeted ATS
domains through a web search provider, discovers company job boards, fetches
structured listings where the ATS permits it, and scores each job against your
saved profiles.

All profiles, jobs, decisions, settings, and run history live in a local SQLite
database. A fresh install starts with the ATS definitions and runtime defaults,
but no profiles, company boards, jobs, matches, or history.

## Contents

- [What it does](#what-it-does)
- [Requirements](#requirements)
- [Start with a clean database](#start-with-a-clean-database)
- [Search provider configuration](#search-provider-configuration)
- [Create a useful search profile](#create-a-useful-search-profile)
- [Run your first discovery](#run-your-first-discovery)
- [Understand the pages](#understand-the-pages)
- [ATS coverage](#ats-coverage)
- [Command-line use](#command-line-use)
- [Search tuning](#search-tuning)
- [Why run counts and visible cards differ](#why-run-counts-and-visible-cards-differ)
- [Troubleshooting](#troubleshooting)
- [Data and security](#data-and-security)
- [Production-style local run](#production-style-local-run)
- [Architecture](#architecture)
- [Design system packages](#design-system-packages)
- [Development](#development)

## What it does

```text
Search profile
    -> one regional web query per title and source pattern
    -> one extra worldwide-remote query when remote roles are enabled
    -> one location-led board query per sync-capable source pattern
    -> discovered job URLs and company boards
    -> direct ATS board sync where supported
    -> normalized jobs in SQLite
    -> deterministic profile matching
    -> new, saved, applied, and hidden job lists
```

The web search stage finds leads. The direct sync stage confirms jobs through
public ATS endpoints and imports the rest of each discovered board. Matching is
rule-based and does not call an LLM.

## Requirements

- Node.js 24
- pnpm 11 through Corepack
- One supported web search API key
- Network access to the selected search provider and public ATS endpoints

The app is built with React Router 8, Vite 8, React 19, TypeScript, SQLite, Drizzle ORM, Zod, and
Vitest. Zod validates web input, vendor and search-provider responses, and runtime configuration at
the adapter that receives each value.

## Start with a clean database

1. Install the locked dependencies.

   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   ```

2. Copy the environment template.

   ```bash
   cp .env.example .env
   ```

3. Add at least one search provider key to `.env`.

   ```dotenv
   DB_PATH=./data/job-radar.sqlite
   BRAVE_SEARCH_API_KEY=
   SERPAPI_KEY=
   SERPER_API_KEY=
   ALLOW_REMOTE_UI=0
   ```

4. Create the SQLite database and apply every migration.

   ```bash
   pnpm db:setup
   ```

5. Start the development server.

   ```bash
   pnpm dev
   ```

6. Open `http://localhost:3000`.

On a clean setup, the Jobs page asks you to create a profile. The Sources page
contains 15 built-in search patterns, including Web3 Career, Cryptocurrency
Jobs, and CryptoJobsList. The profile list, board registry, jobs, and run
history are empty.

The `data/` directory and every `.env` file except `.env.example` are ignored by
Git. Cloning the repository does not copy another user's database or secrets.

### Start another empty dataset

You do not need to delete an existing database. Stop the app, set `DB_PATH` to a
new filename, and run the setup command again:

```dotenv
DB_PATH=./data/job-radar-fresh.sqlite
```

```bash
pnpm db:setup
pnpm dev
```

Changing `DB_PATH` switches the whole workspace. Profiles and settings are
stored in the selected database, so they do not carry across automatically.

### Environment variable reference

| Variable                            | Required | Purpose                                                                                         |
| ----------------------------------- | :------: | ----------------------------------------------------------------------------------------------- |
| `DB_PATH`                           |    No    | SQLite file path. Defaults to `./data/job-radar.sqlite`                                         |
| `BRAVE_SEARCH_API_KEY`              |   One    | Enables Brave Search                                                                            |
| `SERPAPI_KEY`                       |   One    | Enables SerpAPI                                                                                 |
| `SERPER_API_KEY`                    |   One    | Enables Serper.dev                                                                              |
| `ALLOW_REMOTE_UI`                   |    No    | Set to `1` only when another access-control layer protects the app; the default is local only    |

Set at least one of the three provider keys. Keep every secret in `.env`, not
in SQLite or the Settings page.

## Search provider configuration

Job Radar supports three providers. Only one key is required.

| Provider                                                    | Environment variable   | Initial maximum per query | Notes                                                                                     |
| ----------------------------------------------------------- | ---------------------- | ------------------------: | ----------------------------------------------------------------------------------------- |
| [Serper.dev](https://serper.dev/)                           | `SERPER_API_KEY`       |                        10 | Google-backed search and the first choice when several configured providers are available |
| [Brave Search API](https://api-dashboard.search.brave.com/) | `BRAVE_SEARCH_API_KEY` |                        20 | Uses Brave's web index and supports an exact date range request                           |
| [SerpAPI](https://serpapi.com/)                             | `SERPAPI_KEY`          |                       100 | Google-backed fallback with a higher configurable cap                                     |

Provider order, endpoint, result cap, and title query mode are stored in SQLite.
The Settings page edits the endpoint, cap, and title mode. Credentials stay in
`.env`.

The effective web result count is the smaller of **Requested web results per
query** and the selected provider's maximum. Serper free accounts reject a
request for more than 10 results, so raising the global value alone does not
increase a Serper run. This web limit is separate from **Total jobs per
discovered board**, which defaults to 200. Connector page sizes, such as
Workday's default of 20, are pagination sizes rather than job totals.

Provider limits and billing still apply. One discovery run creates:

```text
(target titles x enabled source patterns x search scopes)
+ enabled sync-capable source patterns
```

Search scopes is 1 for a regional-only profile and 2 when **Include remote
roles** is enabled. The remote scope is separate so worldwide roles cannot be
crowded out by regional results, or vice versa. The final term finds regional
company boards even when their indexed job page titles do not match one of your
target titles. Duplicate source definitions are collapsed.

With 5 titles and all 15 built-in patterns enabled, a regional-only run plans
85 provider requests: 75 title queries and 10 location-led board queries. A
profile that also includes worldwide remote roles plans 160 requests: 75
regional title queries, 75 remote title queries, and 10 board queries. Use the
dry run command before a large search if request volume matters.

## Create a useful search profile

Open **Profiles**, select **New profile**, and configure the fields below.

| Field                      | How it is used                                                                                                            |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| Profile name               | Identifies the profile in Jobs and Run history                                                                            |
| Target job titles          | Each title gets its own query for every enabled source pattern; this prevents a common title from crowding out the others |
| Target locations           | Combined with `OR` in discovery, then checked again against the normalized job location                                   |
| Include remote roles       | Adds separate worldwide-remote discovery queries; country-restricted roles must still match a target location             |
| Required job keywords      | Requires at least one term in the title, department, or description; useful for titles shared by unrelated industries     |
| Excluded title terms       | Rejects matching words or phrases in the job title                                                                        |
| Excluded location terms    | Rejects ambiguous or unwanted regions before positive location matching                                                   |
| Excluded job context terms | Rejects phrases found in the title or description                                                                         |
| Maximum age                | Rejects a job with a known posting date older than this value; jobs with no date remain eligible                          |
| Minimum score              | Sets the final title, location, remote, and freshness score needed to appear                                              |
| Include unverified leads   | Allows search results that could not be confirmed through structured ATS data                                             |
| Preferred salary range     | Applies an optional annual salary overlap check without removing jobs whose salary is missing                             |

Use one profile per region when locations and exclusions differ. For example,
separate UK and UAE profiles produce clearer queries and make location
exclusions easier to reason about.

### Salary range behavior

Salary settings are optional. Enter a three-letter currency such as `GBP`,
`USD`, or `AED`, plus a minimum, maximum, or both. Amounts are annual whole
numbers.

A known salary in the same currency must overlap the profile range. If a
profile is set to GBP 100,000 through 150,000:

- GBP 90,000 through 120,000 remains eligible because the ranges overlap.
- GBP 70,000 through 90,000 is excluded.
- GBP 160,000 through 190,000 is excluded.
- A USD range remains eligible because Job Radar does not convert currencies.
- A role with no salary, an unclear salary, or a non-annual rate remains
  eligible.

Ashby salary components are read from its structured public response. Other
listings use clearly labelled annual salary or compensation text in the job
description or search snippet. Job Radar does not convert currencies, hourly
rates, bonuses, or equity. An unqualified `$` symbol is treated as USD; use
explicit currency codes where salary data may otherwise be ambiguous.

Salary never changes the web query. It is applied after jobs are fetched so
that postings without salary data are not lost during discovery.

## Run your first discovery

1. Create and save a profile.
2. Return to **Jobs**.
3. Choose a configured provider.
4. Select **Run discovery**.
5. Open **Run history**, then open the run to inspect every title and ATS query.
6. Return to **Jobs** to review the matched roles.

Discovery runs in the background. The Jobs page polls for progress, and you can
continue using the app while it runs.

Each run:

1. Builds one regional query per target title and enabled source pattern.
2. Adds one worldwide-remote query per title and source when remote roles are
   enabled.
3. Adds one location-led query for every sync-capable source pattern.
4. Sends the queries to the chosen provider.
5. Classifies returned URLs by ATS.
6. Saves search hits, including zero-result and failed queries.
7. Adds newly discovered company boards.
8. Refreshes supported boards through their public structured endpoints.
9. Re-evaluates the fetched jobs against the latest saved version of the
   profile.

The default title search mode requires every token in a target title to appear
in the page title. This is intentionally strict. `Anywhere on page` can improve
recall for unusual pages, but it also returns jobs that only mention the title
in their description. Explicit phrases such as "work from anywhere" and
"anywhere in the world" allow a remote role even when the posting also names a
nominal headquarters or office location.

Discovery and profile evaluation yield between SQLite batches. Profile and
settings forms therefore remain usable during a long board import. A profile
saved during discovery is reloaded before that run performs its final
evaluation.

## Understand the pages

### Jobs

Jobs is the working shortlist. Filter it by profile, ATS, status, or free text.
Statuses are:

- `new`: not reviewed yet
- `saved`: worth revisiting
- `applied`: application submitted
- `hidden`: removed from the normal active view

Hidden jobs appear only when the Hidden status filter is selected. The active
view also collapses duplicate listings with the same normalized company and
title, preferring a direct ATS listing over a LinkedIn copy.

### Profiles

Create, edit, clone, and delete matching profiles. Saving a profile changes the
rules used by the next discovery, board refresh, or reindex. Clone a profile
when two regions or role families share most settings.

### Sources

Sources controls discovery coverage and the known company board registry.

- Pause a source pattern to stop generating queries for it.
- Web3 Career, Cryptocurrency Jobs, and CryptoJobsList are included as
  search-only job-board sources. Job Radar verifies individual results when the
  live page exposes schema.org `JobPosting` data and rejects an expired
  `validThrough` date. A protected or unstructured page still follows the
  profile's **Include unverified leads** rule unless the same role is confirmed
  through a supported ATS board.
- Paste any public ATS job, careers, or board URL. Recognized built-in systems
  register a company board; unknown hosts create an enabled search-only
  integration and source.
- Pause a company board without removing its stored jobs.
- Select **Refresh boards** to update every enabled known board without using
  search provider requests.

### Run history

Run history records provider, profile, status, counts, and errors. Open a run
to see every ATS, title term, source pattern, result count, and query failure.
Zero-result searches are stored, which makes missing coverage visible.

### Settings

Settings contains non-secret runtime configuration:

- request timeout and HTTP user agent
- results requested per query and jobs fetched per board
- web freshness and title query mode
- run polling and stale-run timeout
- title, location, remote, and freshness scoring weights
- ignored and generic title words
- provider endpoints, result caps, and provider-specific title modes
- ATS host recognition, search patterns, sync capability, page size, and
  endpoint templates
- custom search-only ATS integrations

Settings take effect on the next operation. Changing ATS endpoint templates or
hostname rules can stop URL classification or board sync, so treat the
integration section as advanced configuration.

### Theme

Use the theme control in the masthead to cycle through system, light, and dark
modes. A manual choice is stored in the browser only. System mode follows the
operating system preference and does not write a preference to SQLite.

### Add another ATS integration

The fastest route is **Sources → Add ATS URL**. Paste a public job, careers, or
board URL. Job Radar derives an ID and display label from an unknown hostname,
adds the integration, and enables that hostname for the next discovery.

Use **New integration** in Settings when you want to control the values
yourself:

- a stable lowercase ID, such as `teamtailor`
- the display name
- one or more domains used to build `site:` searches
- exact hostnames or hostname suffixes used to recognize result URLs

Settings also exposes the default priority assigned when **Add ATS URL** creates
a search-only integration. Lower numbers appear earlier in the registry and
search-source ordering.

New integrations are search-only. They can generate queries, classify results,
appear in filters, and save unverified leads. Enable **Include unverified
leads** on a profile if you want those leads to appear as matches.

Direct board sync is available only for the built-in connectors listed below.
Adding an ID and endpoint template is not enough to parse an unfamiliar ATS
response. A new direct connector needs URL classification, pagination and
response normalization code, fixtures, and tests. Until that exists, the
Settings form keeps the integration in search-only mode instead of claiming
that its results are verified.

## ATS coverage

| ATS             | Targeted web discovery | Direct board sync  |
| --------------- | :--------------------: | :----------------: |
| Ashby           |          Yes           |        Yes         |
| Greenhouse      |          Yes           |        Yes         |
| Lever           |          Yes           |        Yes         |
| BambooHR        |          Yes           |        Yes         |
| Workable        |          Yes           |        Yes         |
| SmartRecruiters |          Yes           |        Yes         |
| Workday         |          Yes           |        Yes         |
| Jobvite         |          Yes           |        Yes         |
| iCIMS           |          Yes           |         No         |
| LinkedIn        |          Yes           | No board-wide sync |

LinkedIn job pages are verified individually through its public guest job page.
Listings marked as closed or no longer accepting applications are deactivated.
Temporary request failures leave the prior record unchanged. iCIMS and
LinkedIn do not have a consistent public board feed used by the direct
connector model.

Jobvite is read from its public, server-rendered `jobs/viewall` page. Its
internal JSON-looking URL is not a public JSON feed and is not used.

The initial source patterns are:

```text
jobs.ashbyhq.com
boards.greenhouse.io
job-boards.greenhouse.io
jobs.lever.co
jobs.bamboohr.com
apply.workable.com
careers.workable.com
jobs.smartrecruiters.com
myworkdayjobs.com
careers.icims.com
jobs.jobvite.com
linkedin.com/jobs/view
```

Add or edit patterns in the ATS registry on Settings.

## Command-line use

The browser and scripts use the same SQLite database and discovery code.
Specify profile IDs explicitly so a script never runs against the wrong
profile.

Preview all generated queries without spending provider requests:

```bash
pnpm discover --profile 1 --dry-run
```

Preview one ATS:

```bash
pnpm discover --profile 1 --source ashby --dry-run
```

Run discovery:

```bash
pnpm discover --profile 1 --provider serper
pnpm discover --profile 1 --provider brave
pnpm discover --profile 1 --provider serpapi
```

Run one ATS only:

```bash
pnpm discover --profile 1 --provider serper --source workday
```

Refresh all enabled known boards, or one ATS:

```bash
pnpm sync
pnpm sync --source greenhouse
```

Reprocess saved discovery hits and evaluate every profile without calling a
search provider:

```bash
pnpm reindex
```

Reindex is useful after changing URL classification, search-result
normalization, profile rules, or matching logic. It does not fetch fresh board
data.

Recheck saved LinkedIn jobs and deactivate closed or removed listings:

```bash
pnpm verify:linkedin
pnpm verify:linkedin --profile 1
```

The profile flag limits the second command to that profile's current LinkedIn
matches. The unrestricted command checks every active LinkedIn job. In both
cases, temporarily unavailable pages are reported but left unchanged.

## Search tuning

Good discovery depends more on profile and source configuration than on a large
result cap.

### Title coverage

Use specific titles and list real variants separately:

```text
Platform Engineer
Senior Platform Engineer
Site Reliability Engineer
Cloud Infrastructure Engineer
```

Each title is searched independently. Avoid a single broad title such as
`Engineer` unless the required job keywords and exclusions are strong enough
to handle the noise.

### Location coverage

Include the forms that job boards actually publish:

```text
London
United Kingdom
UK
Remote UK
```

Add excluded locations for ambiguous city names or unwanted countries. Remote
jobs tied to another country are not treated as location-agnostic.

### Context filters

Required keywords use `OR`, so a job needs at least one of them. Start with a
small list of strong signals. A long, narrow list can reject legitimate roles
whose ATS feed has a short description.

Exclusions and salary preferences are post-fetch filters. They do not save
provider requests.

### Freshness

Profile maximum age is the final matching rule for jobs with a known date. The
Settings page also has a web freshness value:

- `0` disables the separate web freshness limit.
- A positive value is capped by the profile maximum age.
- Brave receives a date range.
- Serper receives Google's nearest day, week, month, or year freshness window.
- SerpAPI results are still checked after import when a posting date is known.

Use a wider age window when still-open roles are being missed. Some ATS feeds
do not publish a reliable date, and those jobs remain eligible with the
configured unknown-date score.

### Verification

Profiles exclude unverified web leads by default. This keeps the normal list
focused on live ATS data, but it can hide iCIMS and custom search-only sources.
Enable unverified leads on a profile when you want to inspect those results.
LinkedIn is handled separately: each returned job is checked against the public
job page, and known closed listings are deactivated.

## Why run counts and visible cards differ

The run summary reports matches immediately after profile evaluation. The Jobs
page then applies personal state, duplicate handling, source filters, status
filters, and free-text search.

If a run reports eight matches but the Jobs page shows two, check:

1. Set Status to **All active jobs** and clear the other filters.
2. Select **Hidden** to see roles hidden in an earlier review.
3. Look for duplicate company and title pairs across LinkedIn and a direct ATS.
4. Confirm that the Jobs page is using the same profile as the run.

Hidden jobs still count as profile matches in run history. They are omitted
from the normal active list.

## Troubleshooting

### A provider is marked "key missing"

Add its key to `.env` and restart the Job Radar process. Environment variables are
read when the server starts.

### A run returns zero results for some titles

Open the run detail page first. It shows whether each query completed, failed,
or returned zero hits.

Then check:

- the exact generated query with `pnpm discover --profile ID --dry-run`
- whether the ATS source pattern is enabled
- title spelling and variants
- location synonyms
- provider result caps and account quota
- title query mode
- web freshness and profile maximum age

A successful query with zero results is different from a provider error. The
run detail page preserves both.

### Search hits exist but no jobs appear

Check the profile's title, location, required keywords, exclusions, maximum age,
minimum score, and verification setting. Salary absence is never the reason a
job disappears.

If the result belongs to a supported ATS but no board was discovered, add its
public URL on Sources and refresh the board.

### LinkedIn shows a closed role

Run the targeted verifier:

```bash
pnpm verify:linkedin --profile ID
```

Future discovery runs also check each LinkedIn result before matching it. A
closed marker or a `404`/`410` response deactivates the record.

### A profile or setting appears stuck on "Saving"

Update to the current code and restart the app. Discovery now yields between
SQLite processing batches, so server actions can run while jobs are being
imported or re-evaluated. Check the terminal and Run history for an older
process still running the previous implementation.

### Board refresh reports an error

Open Sources and inspect the board health. Common causes are an invalid board
URL, a changed public ATS endpoint, a disabled board, or a network timeout.
Review the ATS hostname and endpoint template on Settings before changing code.

### The app reports missing SQLite settings or tables

Run:

```bash
pnpm db:setup
```

Also confirm that the app and CLI use the same `DB_PATH`.

### Port 3000 is busy

Vite prints the selected development port when it starts. You can choose one explicitly:

```bash
pnpm dev --port 3001
```

## Data and security

The default database is `data/job-radar.sqlite`. SQLite also creates temporary
`-wal` and `-shm` files while the app is running. These files and `.env` are
ignored by Git.

The database stores:

- profiles, salary preferences, and job states
- provider and ATS runtime settings
- discovered boards and normalized jobs
- raw public ATS payloads
- search queries, hits, run metrics, and errors
- saved, applied, and hidden decisions

Data is local, but network requests are not. Search queries are sent to the
provider you select, and public job data is fetched from ATS endpoints.

`ALLOW_REMOTE_UI=0` restricts mutations to localhost hostnames. The app has no
authentication or multi-user authorization. Do not expose it to an untrusted
network. Setting `ALLOW_REMOTE_UI=1` removes the localhost mutation check and
should only be used behind access controls you operate.

## Production-style local run

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
pnpm db:setup
pnpm build
pnpm start
```

Keep the Node.js process alive while background discovery is running.

## Architecture

Job Radar is one deployable application in a pnpm workspace. Business code is
grouped by bounded context. The dependency direction, rather than a folder
named `hexagon`, marks the ports-and-adapters boundary.

```text
apps/
└── web-docs/                         private Storybook application

packages/
├── design-tokens/                    context-neutral semantic CSS tokens
└── design-ui/                        context-neutral React components

src/
├── contexts/
│   └── discovery/
│       ├── CONTEXT.md                Discovery language and ownership
│       ├── domain/                   matching, salary, and job-state policy
│       ├── application/              commands, results, use cases, and owned ports
│       ├── infrastructure/           SQLite, search, ATS, and scheduler adapters
│       ├── presentation/web/         React components, requests, and formatters
│       ├── composition/web/          React Router delivery and concrete wiring
│       └── test-support/             reusable fakes used only by tests
└── platform/                         context-independent SQLite and HTTP mechanisms
```

Dependencies point inward. Domain code imports only its own domain modules.
Application code may import the Discovery domain, but it cannot import React Router, Zod, Drizzle,
Node APIs, or an adapter. Infrastructure implements application-owned ports. Presentation does not
import infrastructure. Composition selects concrete adapters, injects clocks, and connects route
requests to prepared use cases. React Router's application directory is
`src/contexts/discovery/composition/web`; there is no framework-owned `src/app` layer.

Each use case owns its command, result, and port DTOs. Zod request schemas live
under `presentation/web/requests` and map untrusted HTTP input into application
commands. Zod validates each external trust boundary: web input, vendor JSON, and SQLite-backed
configuration. Domain factories validate reconstituted values such as currencies, salary ranges,
and identifiers. The repository does not use global `dto`, `types`, or `schemas` buckets.

The architecture test in `tests/architecture/context-boundaries.test.ts`
enforces those dependency rules. Shared platform code cannot import a bounded
context. Context-specific tables, read models, provider clients, and policy do
not belong in `src/platform`.

The visual packages follow a separate dependency chain:

```text
@job-radar/design-tokens
          ↑
 @job-radar/design-ui
          ↑
 Discovery presentation
```

Tokens and generic UI are shared technical capabilities, not a DDD subdomain
or shared kernel. Discovery-specific components remain inside the Discovery
bounded context. A second product consumer is required before another shared
package is created.

See [`CONTEXT-MAP.md`](CONTEXT-MAP.md), the
[Discovery context glossary](src/contexts/discovery/CONTEXT.md), and
[`DESIGN.md`](DESIGN.md) for the maintained boundaries.

## Design system packages

The design system is split into two focused packages:

| Package | Owns | Must not contain |
| --- | --- | --- |
| `@job-radar/design-tokens` | Semantic colour, type, spacing, radius, shadow, and motion tokens | React, HTML, routes, or product terms |
| `@job-radar/design-ui` | Context-neutral components such as Button, IconButton, TextField, Switch, Modal, Skeleton, and PageHeader | Discovery models, React Router, persistence, or provider code |

Run the generic component catalogue locally:

```bash
pnpm storybook
```

Storybook opens on `http://localhost:6006`. Build the static catalogue with
`pnpm storybook:build`. The packages are workspace boundaries today; no publishing workflow or
release tool is configured. Add one only when an external consumer requires independently released
artifacts.

The workspace uses pnpm directly. Turbo or Nx is not required for two small libraries and one
application. Add a task orchestrator only when CI timings or a larger dependency graph justify it.

## Development

Run the complete local check suite:

```bash
pnpm check
pnpm test:coverage
pnpm test:mutation
pnpm storybook:build
pnpm test:e2e
pnpm build
pnpm audit
```

`pnpm check` runs Biome formatting and lint checks, the strict TypeScript compiler, and Vitest.
Coverage has enforced thresholds. Stryker mutates the Discovery domain and application layers and
fails below the configured mutation score. Use `pnpm format` and `pnpm lint:fix` to apply safe local
fixes.

Vitest and Playwright migrate their own SQLite databases under the operating
system temporary directory and remove them after the run. The test suites do
not read or modify the database named by your normal `DB_PATH`.

Playwright downloads its own Chromium build on first use. If that download
fails, for example because the machine cannot reach `cdn.playwright.dev`, run
the browser journeys against an installed Google Chrome instead:

```bash
PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm test:e2e
```

Module behavior tests live beside their owner as `*.test.ts`. Repository-wide
dependency tests live in `tests/architecture`, runner setup is in
`tests/support`, and browser journeys live in `e2e`.

Build only the shared packages with `pnpm packages:build`. The root build
does this automatically before compiling the application. Workspace
dependencies use `workspace:^`, which prevents a missing local package from
silently resolving to a registry copy and becomes a normal compatible SemVer
range when published.

Lefthook installs the repository hooks during `pnpm install`. The pre-commit
hook runs Biome against staged files. The commit-message hook enforces scoped
Conventional Commits through Commitlint, and the pre-push hook runs type
checking and unit tests. See
[`CONTRIBUTING.md`](CONTRIBUTING.md) for the accepted scopes and examples.

After changing
`src/contexts/discovery/infrastructure/sqlite/schema.ts`, create a migration
and apply it:

```bash
pnpm db:generate
pnpm db:migrate
```

Migrations contain DDL only. Product defaults for settings, ATS integrations, and source patterns
are inserted idempotently by the bootstrap step after migration. Never place profiles, jobs, run
history, local settings, or other developer data in a migration.

Before changing React Router route modules, loaders, actions, or Vite build
configuration, read the current official framework documentation and follow
[`CONTRIBUTING.md`](CONTRIBUTING.md).

The visual rules and light and dark theme tokens are recorded in
[`DESIGN.md`](DESIGN.md).
