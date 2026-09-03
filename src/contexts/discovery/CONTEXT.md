# Discovery

Discovery finds job listings and evaluates them against a person's search criteria. It owns source coverage, search execution, listing verification, and matching.

## Language

**Activity**:
The feature-agnostic workspace view that presents Discovery Runs and Research Runs together while keeping each run's canonical type and destination.
_Avoid_: Discovery history, Run as a generic domain type

**Adapter settings**:
The Settings section for source coverage and ATS integration rules. It groups configuration without changing the canonical Source, ATS integration, or ATS adapter terms.
_Avoid_: Connector settings

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

**ATS adapter**:
A driven infrastructure implementation that translates an ATS integration's public feed into the application contracts.
_Avoid_: Connector

**Discovery run**:
One execution of a search profile across its enabled sources and company boards.
_Avoid_: Scan, search job

**Stale run**:
A discovery run whose recorded status is still running but which has not reported progress within
the configured stale run timeout. A watcher polling it by id, the run page and Activity history
report it as failed; an active-runs query and the active-run count leave it out. Only starting
another run writes that conclusion down.
_Avoid_: Stalled run, abandoned run, dead run, and Stale listing, which excludes a listing on age
rather than describing a run

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

The job discovery use case owns the run sequence: load configured inputs, plan queries, call the selected search provider, record progress, synchronise discovered boards, and evaluate matches. It depends on five application-owned contracts:

- `DiscoverySetupReader` supplies the profile, enabled sources, and typed discovery policy.
- `DiscoveryRunJournal` records run and query lifecycle changes.
- `SearchProviderDirectory` selects a configured web search provider by name.
- `JobDiscoveryCatalog` records results, verifies listings, and synchronises boards.
- `JobMatchEvaluator` evaluates the latest saved profile against active listings.

Infrastructure implements those contracts with SQLite, ATS parsing, listing verification, provider
clients, and background scheduling. Vendor JSON and runtime configuration are validated with Zod at
this boundary. Presentation owns Discovery-specific React components, request schemas, formatters,
and client-only behaviour. It may consume the context-neutral design packages, but it cannot import
infrastructure or composition.

`ATS integration` is the product term for a configured ATS capability. `ATS adapter` is the
architecture term for its driven implementation. The context uses the canonical port and adapter
vocabulary for implementation roles; `connector` is not an accepted synonym.

React Router requires one application directory. Discovery's `composition/web` directory is that
delivery and composition adapter: route loaders and actions translate HTTP, select concrete
infrastructure, and call prepared use cases. It contains no matching, verification, or provider
policy. Command-line scripts are separate executable composition roots. Reusable fakes live in
`test-support` and cannot be imported by production code.

Discovery composition owns the configured market vocabulary public contract. Recruiter composition
consumes that contract to build its own location catalogue.
