# Discovery

Discovery finds job listings and evaluates them against a person's search criteria. It owns source coverage, search execution, listing verification, and matching.

## Language

**Search profile**:
A named set of titles, locations, exclusions, age limits, score thresholds, and optional salary preferences used to decide which job listings qualify.
_Avoid_: Job alert, search settings

**Salary preference**:
An optional annual compensation range and currency attached to a search profile. It describes what the person wants, not what an employer has published.
_Avoid_: Salary filter, expected salary

**Source**:
A job site or domain included in web search coverage.
_Avoid_: Provider, board

**ATS integration**:
The rules Job Radar uses to recognise and read listings from one applicant tracking system.
_Avoid_: Source, connector

**Company board**:
A company's job catalogue hosted by an ATS and available for direct synchronisation.
_Avoid_: Source, careers page

**Discovery run**:
One execution of a search profile across its enabled sources and company boards.
_Avoid_: Scan, search job

**Search result**:
A page returned by a search provider before Job Radar has confirmed that it is a current job listing.
_Avoid_: Match, job listing

**Job listing**:
A normalised job vacancy collected from an ATS or another supported job site.
_Avoid_: Search result, opportunity

**Unverified lead**:
A search result that looks like a job listing but could not be confirmed through a structured source.
_Avoid_: Match, job listing

**Match**:
The result of evaluating a job listing against one search profile. A match records the score and the reasons for inclusion or exclusion.
_Avoid_: Search result, saved job

## Current boundary

The domain owns search-profile vocabulary, annual salary interpretation, job-listing state, and deterministic matching. The application owns search-query planning, the Discovery Run lifecycle, use-case orchestration, and the ports consumed by those use cases.

Starting a Discovery Run has two stages:

1. Reserve one active run for the selected search profile.
2. Schedule execution on the next Node.js event-loop turn so the HTTP action can return immediately.

The application owns both decisions. SQLite decides how a reservation is stored, and the background adapter decides how deferred work is scheduled. A failed execution is written back only while the run is still active, so a late failure cannot overwrite a terminal state.

The job discovery use case owns the run sequence: load configured inputs, plan queries, call the selected search provider, record progress, refresh discovered boards, and evaluate matches. It depends on five application-owned contracts:

- `DiscoverySetupReader` supplies the profile, enabled sources, and typed discovery policy.
- `DiscoveryRunJournal` records run and query lifecycle changes.
- `SearchProviderDirectory` selects a configured web search provider by name.
- `JobDiscoveryCatalog` records results, verifies listings, and refreshes boards.
- `JobMatchEvaluator` evaluates the latest saved profile against active listings.

Infrastructure implements those contracts with SQLite, ATS parsing, listing verification, provider clients, and background scheduling. Presentation owns React components, React Router route modules, request schemas, response DTOs, and HTTP translation. Modules in `composition` choose concrete infrastructure and supply clocks and cooperative event-loop yielding. Command-line scripts are separate executable composition roots. Reusable fakes live in `test-support` and cannot be imported by production code.

Discovery-specific React components may live in the versioned
`@job-radar/discovery-ui` workspace package. That package remains part of this bounded
context. Routes own the mapping from application and read-model results into presentation
DTOs. The package may consume context-neutral design tokens and UI primitives, but it
must not import Discovery infrastructure or composition.
