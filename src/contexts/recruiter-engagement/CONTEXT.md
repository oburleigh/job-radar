# Recruiter Engagement

Recruiter Engagement records public research about recruitment firms and named technology recruiters for a user-supplied market brief. It does not hold candidate records, contact details, outreach activity, or a shared people directory.

## Language

**Search brief**
: The user's plain-language hiring focus and requested firm and recruiter counts.

**Research criteria**
: The catalogue-backed target locations, technology specialisms, and target industries that focus both research stages. Target locations come from the configured market vocabulary.

**Research run**
: One durable attempt to research firms first, then named recruiters, against a frozen policy and source plan.

**Retry lineage**
: The prior run identity recorded on a new attempt. It proves that a retry reused the original brief, policy, source plan, and budget without treating the runs as the same directory record.

**Observation**
: A sourced fact retained for one research run. Firm observations and recruiter observations have distinct run-local identities.

**Evidence**
: The public source URL, attributable excerpt, observation date, confidence, adapter identifier, and policy version attached to an observation.

**Adapter policy**
: The immutable rules for one run's research adapter, model, reasoning effort, web search, ephemeral mode, sandbox, retry behaviour, source limits, permitted data, and local failure behaviour.

**Source plan**
: The immutable source boundaries, permitted adapter and policy version, and stage budgets used for one research run.

**Research budget**
: The firm and recruiter targets plus the per-stage request allowance frozen with a run. It records consumption and exhaustion without promising market coverage.

**Coverage**
: The recorded firm and recruiter counts, completed stages, source failures, and completion reason. It describes the run, not the target market as a whole.

## Current boundary

The domain owns the vocabulary and terminal-state rules. The application owns starting, resuming, cancelling, retrying, target-location validation, and recording a run. It depends on a run store, a staged research source, a scheduler, and values supplied by composition.

Infrastructure maps configured ISO market entries to selectable target locations, stores runs and recruiter research settings in SQLite, and provides two sources. The seeded settings own the default brief, target counts, model, reasoning effort, stage request limit, and timeout; each run freezes the applicable values. Legacy persisted single-location criteria are read as one target location. The deterministic staged source supports local tests. The local Codex source starts a separate read-only, ephemeral Codex process for the firm stage and recruiter stage. It uses the existing ChatGPT Business login and removes `OPENAI_API_KEY` from its child environment. Only each stage's schema-validated final output becomes an observation. Failed local stages retain a safe recovery message. Bounded raw process diagnostics go only to server stderr.

Presentation owns route request parsing, the controlled target-location selection, polling, status copy, and the grouped research results. It does not import SQLite, Discovery presentation, or the Codex adapter. The composition root selects the deterministic source only for explicit test configuration; normal local use selects the direct Codex source.
