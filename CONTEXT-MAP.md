# Context Map

## Current context

- [Discovery](./src/contexts/discovery/CONTEXT.md) owns search profiles, source coverage, discovery runs, job listings, verification, and matching.
- [`@job-radar/discovery-ui`](./packages/discovery/ui) is Discovery's versioned presentation package. It is not a separate bounded context.

## Shared visual capabilities

[`@job-radar/design-tokens`](./packages/design-system/tokens) and
[`@job-radar/ui`](./packages/design-system/ui) are context-neutral technical packages.
They contain no domain model and are not a DDD shared kernel. Their dependency rules and
release policy are recorded in
[ADR 0002](./docs/adr/0002-versioned-design-system-packages.md).

## Candidate context

Opportunity Tracking may become a separate context when saved, hidden, applied, and interview states gain a lifecycle or language independent from Discovery. Discovery owns the current job-listing state policy, use case, and persistence adapter until that boundary is earned. No empty context package is created in advance.

## Relationship

If Opportunity Tracking is split out, it will consume a stable Discovery contract for matched listings. The integration mechanism is deliberately undecided. A direct application call is enough while Job Radar remains one local process; an event bus is not justified by a future possibility alone.
