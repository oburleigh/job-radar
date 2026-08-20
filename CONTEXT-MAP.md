# Context Map

## Current context

- [Discovery](./src/contexts/discovery/CONTEXT.md) owns search profiles, source coverage, discovery runs, job listings, verification, and matching.

## Candidate context

Opportunity Tracking may become a separate context when saved, hidden, applied, and interview states gain a lifecycle or language independent from Discovery. Discovery owns the current job-listing state policy, use case, and persistence adapter until that boundary is earned. No empty context package is created in advance.

## Relationship

If Opportunity Tracking is split out, it will consume a stable Discovery contract for matched listings. The integration mechanism is deliberately undecided. A direct application call is enough while Job Radar remains one local process; an event bus is not justified by a future possibility alone.
