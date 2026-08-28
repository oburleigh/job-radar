# Context Map

## Current contexts

- [Discovery](./src/contexts/discovery/CONTEXT.md) owns search profiles, source coverage, discovery
  runs, job listings, verification, and matching.
- [Recruiter Engagement](./src/contexts/recruiter-engagement/CONTEXT.md) owns public recruitment
  research, canonical firms and recruiters, evidence history, identity review, and directory ranking.

## Shared visual capabilities

[`@job-radar/design-tokens`](./packages/design-tokens) and
[`@job-radar/design-ui`](./packages/design-ui) are context-neutral technical packages. They contain
no domain model and are not a bounded context or DDD shared kernel. Their rules are defined in
[`DESIGN.md`](./DESIGN.md), and their Storybook consumer lives in [`apps/web-docs`](./apps/web-docs).

## Candidate context

Opportunity Tracking may become a separate context when saved, hidden, applied, and interview states
gain a lifecycle or language independent from Discovery. Discovery owns the current job-listing
state, use case, and persistence adapter until that boundary is earned. No empty context package is
created in advance.

## Relationship

If Opportunity Tracking is split out, it will consume a stable Discovery contract for matched listings. The integration mechanism is deliberately undecided. A direct application call is enough while Job Radar remains one local process; an event bus is not justified by a future possibility alone.
