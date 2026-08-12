# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Job Radar is built for an individual job seeker who wants to run a private search workspace on their own machine. The user may track several role families or regions through separate search profiles, then review and manage the resulting shortlist in one place.

Shared and multi-user use is not currently part of the product.

## Product Purpose

Job Radar finds current roles across applicant tracking systems and specialist job boards, checks them against explicit profile rules, and gives the user a practical shortlist to review. Success means relevant roles are found while they are still active, missing or filtered results can be explained, and the user can move each role through a simple new, saved, applied, or hidden workflow.

## Positioning

Job Radar combines broad web discovery with direct public ATS board imports. It runs separate searches for each title, source, and regional or worldwide-remote scope, then records every query and applies deterministic matching rules. The user can inspect where the app searched, what it found, and why a role matched or was excluded.

## Operating Context

The app runs as a local Next.js web application backed by SQLite. The user supplies a supported web search API key, creates one or more profiles, starts discovery from the Jobs page, and reviews query-level results in Run history. Known company boards can be refreshed directly without another paid web search.

Profiles define target titles, locations, remote eligibility, required and excluded terms, age limits, score thresholds, unverified-lead handling, and an optional salary range. Jobs with missing salary data remain eligible. Salary comparison only excludes a known annual range when it uses the same currency and does not overlap the profile range.

The Sources area controls search patterns, ATS integration rules, and known company boards. The Settings area stores non-secret runtime, matching, provider, and integration configuration in the active SQLite database. Search credentials remain in environment variables.

## Capabilities and Constraints

- Discovery depends on a configured third-party search provider and the public behavior of job boards and ATS endpoints.
- Search and matching are currently rule-based. An LLM-assisted layer is a future option, but its role and boundaries are still undecided. It must not make search coverage or exclusion decisions impossible to inspect.
- Direct structured board sync is available only when an integration has a compatible public endpoint. Other sources remain search-only and may produce unverified leads.
- LinkedIn and structured job pages are checked for signs that a role is closed or expired when the available page data makes that possible.
- Each SQLite database is a separate private workspace containing profiles, settings, jobs, decisions, sources, and run history.
- Discovery runs in the background, and profile or settings work should remain available while a run is active.
- Query counts, zero-result searches, failures, imported jobs, and final match counts remain visible for audit and troubleshooting.
- Currency conversion, hourly-rate conversion, bonuses, and equity valuation are outside the current salary-matching model.

## Brand Commitments

The product name is Job Radar. Its existing language presents it as a private search desk: direct, practical, transparent, and focused on giving the user control. No visual style, palette, typography, or component direction is fixed by this product record. Future design direction is delegated, with a high craft bar.

## Evidence on Hand

The repository contains the working application, SQLite schema and migrations, discovery and matching tests, built-in source definitions, setup documentation, and an interface for jobs, profiles, sources, run history, and settings. These are product evidence and can be demonstrated locally.

There are no confirmed testimonials, customer logos, usage benchmarks, pricing claims, or public service guarantees. Future product or marketing work must not invent them.

## Product Principles

1. Favor search coverage that can be inspected over opaque result totals.
2. Explain exclusions and missing results instead of asking the user to trust the shortlist.
3. Keep private data and configuration under the user's control.
4. Preserve useful unknowns. Missing salary or posting dates should not remove an otherwise relevant role without an explicit rule.
5. Make sources, matching rules, and runtime limits configurable without requiring code changes.

## Accessibility & Inclusion

The web interface should support keyboard operation, visible focus, semantic controls, readable contrast, and responsive use down to a 320-pixel viewport. No additional product-specific accessibility requirement has been confirmed.
