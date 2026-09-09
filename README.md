# Job Radar

Job Radar runs on your machine and keeps job discovery, recruiter research, and
your review decisions in SQLite. Use **Opportunities** to find and triage job
listings, and **Recruiter Search** to research recruitment firms and named
recruiters with retained source evidence.

It is a single-user application. There is no account system or hosted service.

## Contents

- [Run the application](#run-the-application)
- [Implemented features](#implemented-features)
- [Configuration](#configuration)
- [Command-line use](#command-line-use)
- [Limitations and roadmap](#limitations-and-roadmap)
- [Troubleshooting](#troubleshooting)
- [Development](#development)
- [Data and security](#data-and-security)
- [Architecture](#architecture)
- [Reference data](#reference-data)
- [Contributing](#contributing)
- [Licence](#licence)

## Run the application

Install Node.js 24, Corepack, and the pnpm version pinned in
[`package.json`](package.json). The setup check requires pnpm 11 and at least
one configured search provider key. Recruiter Search also needs the
[Codex CLI](https://github.com/openai/codex) installed and authenticated on the
same machine.

From the repository root:

```bash
corepack enable
pnpm install --frozen-lockfile
cp .env.example .env
```

In Windows PowerShell, use `Copy-Item .env.example .env` for the last command.
Copy the template only for a new setup; keep an existing `.env`.

Add a search provider key to `.env`: `SERPER_API_KEY`, `BRAVE_SEARCH_API_KEY`,
or `SERPAPI_KEY`. Then run:

```bash
pnpm setup:check
pnpm db:setup
pnpm dev
```

Open **http://localhost:5173**. A new database has default settings and source
definitions, but no profiles, company boards, jobs, or run history.

Setup initializes the current schema directly. Running it again preserves an
existing database with the same schema and keeps edited settings. It rejects
older or incompatible schemas before changing them; development migration
history is not distributed. Back up an older database and arrange an explicit
upgrade before using it with this version.

1. Open **Search profiles** in the masthead and create a profile. Add target
   titles and choose target locations from the catalogue.
2. Return to **Opportunities**, select the profile and a configured provider,
   and choose **Run discovery**.
3. Open **Activity** to follow the run, inspect its evidence, or cancel it.
4. Review the matched listings in **Opportunities**. Save, mark applied, or
   hide individual jobs.

Keep the server process running while background work is active. The
development server reloads source edits. To use a different development port,
run `pnpm dev --port 5174`; it will fail if the requested port is occupied.

### Run a production build locally

After installation, configuration, and database setup:

```bash
pnpm build
pnpm start
```

Open the URL printed by the server, normally **http://localhost:3000** unless
you have set `PORT` or that port is occupied. `pnpm start` serves
`build/server/index.js` and binds to `127.0.0.1`. Build again after changing
source. Do not rebuild a directory while another process is serving it.

### Use a separate dataset

Stop the application, change `DB_PATH` in `.env` to a new filename, then run
`pnpm db:setup` and start it again. This creates a separate workspace without
deleting the previous file. Profiles and settings belong to the selected
database.

## Implemented features

### Opportunities

- Create, edit, clone, and delete search profiles. Profiles contain target
  titles, catalogue-backed locations and salary currency, remote preferences,
  keyword exclusions, age and score thresholds, and an optional annual salary
  range.
- Discover listings through Serper, Brave Search, or SerpAPI. Search planning
  combines source patterns, resolved markets, and configured query strategies.
  Worldwide-remote and company-board discovery are separate search lanes.
- Discover and refresh company boards. Supported adapters fetch structured
  jobs directly; refreshing known boards does not spend web-search requests.
- Match jobs using deterministic rules. Matching does not call an LLM.
  Missing salary remains eligible; a known annual range in the preferred
  currency must overlap the profile range. There is no currency conversion.
- Filter matched listings by source, review state, and text. Save jobs, mark
  them applied, or hide them. The active view collapses duplicate company/title
  listings and prefers direct ATS evidence over a LinkedIn copy.
- Run discovery in the background with immediate notifications, continuing
  progress, cancellation, and completion or failure details. Activity retains
  run history; run details include request evidence and a known-role diagnostic
  that explains what happened to a supplied public job URL.

The adapters include direct board sync for Ashby, Greenhouse, Lever, BambooHR,
Workable, SmartRecruiters, Workday, and Jobvite. LinkedIn listings are checked
individually through public job pages, without board-wide sync. iCIMS and
custom integrations support search-only discovery. Web3 Career,
Cryptocurrency Jobs, and CryptoJobsList results can be verified when their
public pages expose supported `JobPosting` data.

An enabled search-only integration can find and classify leads; it does not
gain a board-sync adapter merely by adding an endpoint template. Profiles
exclude unverified leads by default.

### Recruiter Search

The Research tab accepts catalogue-backed target locations, Specialisms, and
Target industries, firm and recruiter targets, and optional additional context.
A Research run first researches firms, then recruiters at qualified firms. It
retains observations, source URLs, excerpts, confidence, coverage, and failures.
The normal source uses the local Codex CLI. Model, reasoning effort, stage
timeout, and request limits come from Research execution settings and are
frozen for each run.

The Directory tab combines retained firms and recruiters across runs and
supports Specialism filtering. Removal is reversible and survives rediscovery.
Removing a firm lets you choose whether to remove its recruiters too or keep
them without a firm.

Run results expose ranking contributions and identity reviews. You can create
Shortlists, add Recruiters as Prospects, and manage Suppression or Do Not
Contact decisions. Campaign preparation reports eligibility from retained
evidence and exclusions. It does not create a Campaign or send a message.

Cancellation and Continuation retain the research checkpoint and evidence.
Continuation creates a new run with a fresh request allowance; it does not
reopen the old run. Counts describe the work returned by a run, not exhaustive
coverage of a market.

### Settings and themes

Settings edits the SQLite-backed discovery policy, provider endpoints and
limits, ATS integration rules, source coverage, company boards, recruiter
criteria catalogues, ranking weights, and Research execution settings. Secrets
remain in the environment. Changes generally affect the next operation;
already-started Research runs retain their frozen settings.

The masthead theme control cycles through system, light, and dark. Explicit
theme choices are stored in the browser.

## Configuration

[`.env.example`](.env.example) lists the supported deployment variables.

| Variable | Purpose |
| --- | --- |
| `DB_PATH` | SQLite filename; defaults to `./data/job-radar.sqlite` |
| `SERPER_API_KEY` | Serper search credential |
| `BRAVE_SEARCH_API_KEY` | Brave Search credential; also used by real public-search tests |
| `SERPAPI_KEY` | SerpAPI credential |
| `JOB_RADAR_CODEX_BINARY` | Optional path to Codex; otherwise uses `codex` from `PATH` |
| `ALLOW_REMOTE_UI` | `0` by default; `1` permits mutations through non-local hostnames |

`pnpm setup:check` and `pnpm start` require a search provider key, even if you
intend to use only Recruiter Search or board refresh. `pnpm db:setup` performs
the database-only prerequisite check and does not require a provider key.

Set non-secret product policy in Settings. The effective result cap depends on
both the requested count and the selected provider's configured maximum.
Provider quotas and billing apply. Preview the search lanes with the dry-run
command before starting a large discovery.

## Command-line use

Run commands from the repository root. They load `.env` and operate on its
selected database. Replace `1` with an existing profile ID.

```bash
# Inspect planned queries without calling a provider
pnpm discover --profile 1 --provider serper --dry-run
pnpm discover --profile 1 --provider brave --source ashby --dry-run

# Discover and persist jobs
pnpm discover --profile 1 --provider serper
pnpm discover --profile 1 --provider brave --source workday

# Refresh known boards
pnpm sync
pnpm sync --source greenhouse

# Reprocess saved hits and re-evaluate profiles
pnpm reindex

# Recheck public LinkedIn listings
pnpm verify:linkedin --profile 1
```

Reindex does not fetch fresh board data or call a search provider. LinkedIn
verification deactivates confirmed closed or removed listings; temporary
request failures leave the prior record unchanged.

## Limitations and roadmap

The following work is planned, not implemented. No delivery dates are promised.

- Reach every filtered Opportunity through stable paging; the current view stops at 250.
- Reveal the active Settings tab on narrow screens after direct navigation and history changes.
- Build, preview, approve, and manually track outreach sequences from a Shortlist.
- Review selected Recruiters, open exact LinkedIn profiles, and record user-confirmed manual outreach.
- Schedule approved email follow-ups with pause, reply, timing, and duplicate-send controls.

Opening a retained public profile is available today. LinkedIn account
integration, automated connection requests, messaging, and inbox
synchronisation are not implemented. Job Radar does not send email or submit
job applications.

## Troubleshooting

- **Setup fails:** read each prerequisite error. Check Node 24, pnpm 11, and a
  provider key. If Corepack is missing, install it before `corepack enable`.
- **Native SQLite install fails:** a platform without a matching
  `better-sqlite3` binary needs Python and C/C++ build tools. See its
  [troubleshooting guide](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/troubleshooting.md).
- **Provider key missing:** add the credential to `.env` and restart the app.
- **Recruiter Search unavailable:** check that the configured Codex executable
  is installed and authenticated. Inspect Research execution settings and
  the run's failure details.
- **Missing SQLite tables or settings:** stop the app, run `pnpm db:setup`,
  and confirm the server and CLI use the same `DB_PATH`.
- **No matched jobs:** inspect Activity for provider failures and zero-result
  queries. Then check profile rules, source coverage, verification status, and
  the active list filters. Run counts precede the list's filters and duplicate
  handling, and can therefore differ from visible cards.

## Development

Install the browser used by the tests once:

```bash
pnpm exec playwright install chromium
```

Run the complete repository gate:

```bash
mkdir -p reports
{ pnpm verify; echo "EXIT: $?"; } > reports/gate.log 2>&1
```

Read the `EXIT:` line and the file/test counts in the log. The gate runs lint,
type checking, unit tests, browser tests, and `build:verification`.
Verification builds have a separate output directory. Vitest and Playwright
create disposable SQLite databases; they do not use your normal dataset.

`pnpm test:browser` runs deterministic application journeys. `pnpm test:e2e`
also runs the real public-web Recruiter Search journeys with Brave. Those
checks load `.env` and explicitly skip when `BRAVE_SEARCH_API_KEY` is absent.
They do not verify the normal Codex research path. `pnpm test:smoke:codex`
provides a separate Codex smoke check.

If Chromium cannot be downloaded but Google Chrome is installed, use
`PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm verify`. Additional checks include
`pnpm test:coverage`, `pnpm test:mutation`, `pnpm evaluate:discovery`, and
`pnpm test:performance`. See [`PERFORMANCE.md`](PERFORMANCE.md) for performance
fixtures and thresholds.

Run `pnpm storybook` for the shared component catalogue at
`http://localhost:6006`, or `pnpm storybook:build` for its static build.

## Data and security

SQLite holds profiles, jobs, review decisions, configuration, public research
observations, Directory records, Shortlists, and run evidence. Keep the database
and its WAL files, `.env`, and generated reports out of Git.

Local storage does not mean offline execution. Discovery sends search terms to
the selected provider and requests public ATS pages. Normal Recruiter Search
sends its brief and research instructions through the configured Codex CLI.

The app has no authentication. Local-host checks restrict mutations by
default; they do not make a public deployment safe. Use `ALLOW_REMOTE_UI=1`
only behind access controls you operate. Report vulnerabilities through
[`SECURITY.md`](SECURITY.md).

## Architecture

Job Radar is one deployable React Router/Vite application in a pnpm workspace.
Discovery and Recruiter Engagement own their business code under
`src/contexts/`. Domain and application code sit inside the adapter boundary;
composition selects concrete infrastructure. React Router route modules live
in `src/contexts/discovery/composition/web`.

`@job-radar/design-tokens` owns semantic colours, spacing, radii, type, and
motion. `@job-radar/design-ui` owns shared controls and surfaces used by both
contexts. Product styles arrange those components. Storybook lives in
`apps/web-docs`.

See [`CONTEXT-MAP.md`](CONTEXT-MAP.md), [`DESIGN.md`](DESIGN.md), and the
[Discovery](src/contexts/discovery/CONTEXT.md) and
[Recruiter Engagement](src/contexts/recruiter-engagement/CONTEXT.md) glossaries.

## Reference data

Location autocomplete uses
[`@tansuasici/country-state-city`](https://www.npmjs.com/package/@tansuasici/country-state-city).
Its code is MIT-licensed. The underlying
[`countries-states-cities-database`](https://github.com/dr5hn/countries-states-cities-database)
is provided under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

## Contributing

Read [`CONTRIBUTING.md`](CONTRIBUTING.md) before opening a pull request.
Lefthook runs staged-file checks, Conventional Commit validation, and
pre-push type checking and unit tests. Keep schema definitions separate from
seeded product defaults and never include local user data.

## Licence

[MIT](LICENSE).
