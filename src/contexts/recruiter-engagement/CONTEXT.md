# Recruiter Engagement

Recruiter Engagement records public research about recruitment firms and named recruiters for a user-supplied search brief. It does not hold candidate records, private contact details, outbound actions, or a shared people directory.

## Language

**Recruiter Search**:
The user-facing feature for setting a market focus, running public-source research, and reviewing recruitment firms and recruiters in the Directory.
_Avoid_: Recruiter research as a feature or page label

**Search brief**:
The user's plain-language hiring focus and requested firm and recruiter counts.
_Avoid_: Technology brief, research brief

**Research criteria**:
The catalogue-backed target locations, specialisms, and target industries that focus both research stages. Target locations come from the configured market vocabulary.

**Specialism**:
A professional discipline used to focus firm and recruiter research. It is not limited to one sector.
_Avoid_: Technology specialism

**Research run**
: One durable attempt to research firms first, then named recruiters, against a frozen policy and source plan.

**Retry lineage**
: The prior run identity recorded on a new attempt. It proves that a retry reused the original brief, policy, source plan, and budget without treating the runs as the same directory record.

**Observation**
: A sourced fact retained for one research run. Firm observations and recruiter observations have distinct run-local identities.

**Evidence**
: The public source URL, attributable excerpt, observation date, confidence, adapter identifier, and policy version attached to an observation.

**Directory**
: The context-owned set of canonical recruitment firms and recruiters reconciled from observations. It is not a shared people directory.

**Recruitment firm**
: A canonical recruitment organisation identified from its public website domain. Observed names and other sourced facts remain evidence rather than silently replacing the canonical record.

**Recruiter**
: A canonical named professional identified from a Public profile and associated with a recruitment firm when the retained evidence supports that relationship. A matching publicly evidenced work email may propose an identity review but never merges profiles automatically.

**Public profile**
: A publicly accessible professional profile used to identify a Recruiter and retained with its Evidence. A Source adapter supplies the profile; the provider is not part of the core Recruiter model.

**Work-email evidence**
: A publicly published work mailbox and its own Evidence. The mailbox is trimmed and case-normalised for comparison. It may support a possible identity match, but the current `local-codex-cli-web-search-v1` Adapter Policy prohibits collecting contact data and therefore never emits it.

**Identity review**
: A possible duplicate that remains separate until the user chooses to merge it or keep it separate.

**Canonical correction**
: A user-selected value for a recruitment firm or recruiter. The correction is recorded without deleting the observations that led to it.

**Shortlist**
: A named working set of canonical Recruiters selected from the Directory. One Shortlist contains at most one Prospect for each canonical Recruiter, even when several research runs found that Recruiter.

**Prospect**
: A canonical Recruiter selected into a Shortlist. A Prospect retains the Recruiter's Evidence and has an explicit contact exclusion state.
_Avoid_: Candidate

**Contact route**
: A public work channel retained with its own Evidence. A Contact route is eligible for Campaign preparation only when its current value matches that Evidence.
_Avoid_: Personal contact detail

**Prior engagement**
: A recorded past interaction with a Prospect. No recorded Prior engagement means the Directory has no retained interaction, not that no interaction happened.

**Suppression**
: A reversible exclusion that makes a Prospect ineligible for Campaign preparation without recording a Do Not Contact decision.

**Do Not Contact**
: An explicit user decision that makes a Prospect ineligible for Campaign preparation until the user clears it.
_Avoid_: DNC

**Campaign preparation**
: The eligibility decision that determines whether a Prospect has an evidenced Contact route and no contact exclusion. It does not create a Campaign or perform an outbound action.

**Directory ranking**
: A deterministic score with visible match reasons and unavailable factors. Its weights are stored in recruiter research settings.

**Adapter policy**
: The immutable rules for one run's research adapter, model, reasoning effort, web search, ephemeral mode, sandbox, retry behaviour, source limits, permitted data, and local failure behaviour.

**Source plan**
: The immutable source boundaries, permitted adapter and policy version, and stage budgets used for one research run.

**Research budget**
: The firm and recruiter targets plus the per-stage request allowance frozen with a run. It records consumption and exhaustion without promising market coverage.

**Coverage**
: The recorded firm and recruiter counts, completed stages, source failures, and completion reason. It describes the run, not the target market as a whole.

**Source failure**
: The recorded failure of one planned Source during a Research run stage. It identifies the failed adapter without discarding observations returned by other permitted Sources.

## Current boundary

The domain owns the vocabulary, terminal-state rules, canonical identity rules, evidence reconciliation, identity decisions, corrections, Shortlists, contact exclusions, Campaign preparation eligibility, and deterministic directory ranking. The application owns starting, resuming, cancelling, retrying, target-location validation, recording a run, maintaining the Directory, and managing Shortlists. It depends on run, Directory, and Shortlist stores, a staged research source, a scheduler, and values supplied by composition.

Infrastructure maps configured ISO market entries to selectable target locations, stores runs, the Directory, Shortlists, and recruiter research settings in SQLite, and provides two sources. The seeded settings own the default brief, target counts, directory match weights, model, reasoning effort, stage request limit, and timeout; each run freezes the applicable source values. Legacy persisted single-location criteria are read as one target location. The deterministic staged source supports local tests. The local Codex source starts a separate read-only, ephemeral Codex process for the firm stage and recruiter stage. It uses the existing ChatGPT Business login and removes `OPENAI_API_KEY` from its child environment. Only each stage's schema-validated final output becomes an observation. Failed local stages retain a safe recovery message. Bounded raw process diagnostics go only to server stderr.

Presentation owns route request parsing, the controlled target-location selection, polling, status copy, ranked Directory results, visible unassociated Recruiters, identity decisions, canonical corrections, and Shortlist controls. It does not import SQLite, Discovery presentation, or the Codex adapter. The composition root selects the deterministic source only for explicit test configuration; normal local use selects the direct Codex source.
