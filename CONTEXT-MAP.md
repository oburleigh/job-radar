# Context Map

## Current context

- [Discovery](./src/contexts/discovery/CONTEXT.md) owns search profiles, source coverage, discovery runs, job listings, verification, and matching.

## Planned context

- Opportunity Tracking will own what a person does after a match appears, including saved, hidden, applied, and later interview states. The current job-state code remains in the legacy structure until that behaviour is moved as a tested vertical slice. No empty context package is created in advance.

## Relationship

Opportunity Tracking will consume a stable Discovery contract for matched listings. The integration mechanism is deliberately undecided. A direct application call is enough while Job Radar remains one local process; an event bus is not justified by a future possibility alone.
