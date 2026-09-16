# Context Map

## Current contexts

- [Discovery](./src/contexts/discovery/CONTEXT.md) owns search profiles, source coverage, discovery
  runs, job listings, verification, and matching.
- [Recruiter Engagement](./src/contexts/recruiter-engagement/CONTEXT.md) owns public recruitment
  research, canonical firms and recruiters, evidence history, identity review, and directory ranking.

- [Opportunity Tracking](./src/contexts/opportunity-tracking/CONTEXT.md) owns Applications,
  Application stages and timelines, accepted Next actions, Opportunity assessments, and
  application-specific Relationship plans.

## Shared visual capabilities

[`@job-radar/design-tokens`](./packages/design-tokens) and
[`@job-radar/design-ui`](./packages/design-ui) are context-neutral technical packages. They contain
no domain model and are not a bounded context or DDD shared kernel. Their rules are defined in
[`DESIGN.md`](./DESIGN.md), and their Storybook consumer lives in [`apps/web-docs`](./apps/web-docs).

## Relationships

Opportunity Tracking consumes prepared Discovery contracts for matched Job listings and Search
profiles, and Recruiter Engagement contracts for existing Prospects. Composition selects concrete
adapters. Public context contracts expose prepared reads and commands without selecting SQLite
adapters themselves.

Discovery retains new, saved, and hidden Job listing states. Legacy applied rows remain migration
and rollback evidence; current Application state belongs to Opportunity Tracking. Today composes
owning-context reads without copying their records into a separate store.
