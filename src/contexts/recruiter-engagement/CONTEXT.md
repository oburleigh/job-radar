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

**Target market**:
The geographic scope supported by a Recruitment firm's retained Evidence. Directory pills and filters include every retained market Evidence value the catalogue can label; Research-run ranking separately evaluates its freshness. Specific places use catalogue labels; Global appears only when retained Evidence explicitly supports worldwide operation.
_Avoid_: Target location, which names a user-selected Research criterion rather than a firm's retained Evidence

**Specialism**:
A professional discipline used to focus firm and recruiter research. It is not limited to one sector.
_Avoid_: Technology specialism

**Research run**
: One durable attempt to research firms first, then named recruiters, against a frozen policy and source plan.

**Research execution settings**
: The model, reasoning effort, stage timeout, and stage request limit the local Codex Source runs under. Settings holds the current values. A research run freezes the values it started with into its source plan and budget, and every stage of that run reads them from there rather than from Settings.
_Avoid_: Codex settings, model settings

**Retry lineage**
: The prior run identity recorded on a new attempt. It proves that a retry reused the original brief, policy, source plan, and budget without treating the runs as the same directory record.

**Continuation**
: A new research run that starts at the checkpoint a finished run stopped at, carrying that run's observations onto it so the remaining stages work over the same firms. It takes a fresh request allowance and does not reopen the run it continues.
_Avoid_: Resume, Retry

**Observation**
: A sourced fact retained for one research run. Firm observations and recruiter observations have distinct run-local identities.

**Evidence**
: The public source URL, attributable excerpt, observation date, confidence, adapter identifier, and policy version attached to an observation.

**Directory**
: The context-owned set of canonical recruitment firms and recruiters reconciled from observations. It is not a shared people directory.
_Avoid_: Registry, which names discovery's ATS Registry and made one word mean two different sets

**Directory listing**
: One filtered read of the Directory for a surface to render, carrying the firms and their Target markets, the recruiters without a firm, the Specialisms and Target markets available to filter by, and the counts each of those is drawn from.

**Recruitment firm**
: A canonical recruitment organisation identified from its public website domain. Observed names and other sourced facts remain evidence rather than silently replacing the canonical record.

**Qualified recruitment firm**
: A Recruitment firm with current Evidence for target-market operation, a matching Specialism, and operating activity. Qualification controls entry to the firm set used by the recruiter stage. Ranking does not remove a qualified firm.

**Recruiter**
: A canonical named professional identified from a Public profile and associated with a recruitment firm when the retained evidence supports that relationship. A matching publicly evidenced work email may propose an identity review but never merges profiles automatically.

**Public profile**
: A publicly accessible professional profile used to identify a Recruiter and retained with its Evidence. A Source adapter supplies the profile; the provider is not part of the core Recruiter model.

**Work-email evidence**
: A publicly published work mailbox and its own Evidence. The mailbox is trimmed and case-normalised for comparison. It may support a possible identity match. The current public search policy does not collect contact data.

**Identity review**
: A possible duplicate that remains separate until the user chooses to merge it or keep it separate.

**Removal**
: A reversible exclusion of a recruitment firm or Recruiter from the Directory. The record and its Evidence are retained and a later Observation of the same record does not reverse it. Removing a firm may take its Recruiters with it, and restoring that firm restores only the Recruiters its own removal took.
_Avoid_: Delete, Archive, Suppression, which is a Prospect's Campaign preparation exclusion rather than a Directory one

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
: A deterministic score with visible factor contributions, match reasons, and unavailable factors. Firm factors are Specialism match, target-market operating depth, current mandates or activity, Recruiter-team Evidence, scale or track record, and Evidence freshness and quality. Recruiter role and seniority applies only to Recruiters. The weights are stored in recruiter research settings.

**Ranking contribution**
: The points awarded by one configured Directory ranking factor, together with the Evidence-backed reason for those points. A zero contribution remains visible when the retained Evidence cannot support the factor.

**Adapter policy**
: The immutable rules for one run's public research adapter, request limits, permitted data, retention, and failure behaviour.

**Source plan**
: The immutable source boundaries, permitted adapter and policy version, and stage budgets used for one research run.

**Research budget**
: The firm and recruiter targets plus the per-stage request allowance frozen with a run. It records consumption and exhaustion without promising market coverage.

**Coverage**
: The recorded firm and recruiter counts, completed stages, source failures, and completion reason. It describes the run, not the target market as a whole.

**Source failure**
: The recorded failure of one planned Source during a Research run stage. It identifies the failed adapter without discarding observations returned by other permitted Sources.

**Public search provider selection**
: Whether the wired Source consumes a user-chosen public web search provider for a run. Only the public-web Source does, so only that wiring presents the choice.
_Avoid_: Search engine selection, adapter selection

**Research source in force**
: The Source the composition root has wired for this installation. It decides which recruiter research settings reach a run: Research execution settings on the Codex Source, Public search settings on the public-web Source, neither on the deterministic Source. A Settings surface whose values the Source in force ignores says so rather than presenting controls that decide nothing, and still saves them, because the operator may be preparing a switch.
_Avoid_: Active adapter, current provider, selected engine

## Current boundary

The domain owns the vocabulary, terminal-state rules, canonical identity rules, evidence reconciliation, identity decisions, corrections, Shortlists, contact exclusions, Campaign preparation eligibility, and deterministic directory ranking. The application owns starting, resuming, cancelling, retrying, continuing, target-location validation, recording a run, maintaining the Directory, and managing Shortlists. It depends on run, Directory, and Shortlist stores, a staged research source, a scheduler, and values supplied by composition.

Infrastructure maps configured ISO market entries to selectable target locations and retained market Evidence to catalogue labels, stores runs, the Directory, Shortlists, and recruiter research settings in SQLite, and provides Codex, deterministic, and public-web Sources. Seed data owns the initial brief, target counts, Directory ranking weights, provider selection, query phrases, evidence terms, page limits, and stage request limit. Each Research run freezes the applicable public search policy. Legacy single-location criteria and earlier adapter policy records remain readable. The public-web Source uses the shared server-side web-search transport, accepts partial results, records per-query failures, and maps public firm pages and indexed Public profiles into Observations. The Codex Source researches firms and recruiters through the Codex CLI installed on the machine, one invocation per stage, and consumes no public search provider. The deterministic Source supports local tests.

Presentation owns route request parsing, Public search provider selection where it applies, controlled target-location selection, polling, status copy, ranked Directory results, visible unassociated Recruiters, identity decisions, canonical corrections, and Shortlist controls. It does not import SQLite or infrastructure. The composition root selects the deterministic Source only for explicit test configuration. Normal local use selects the Codex Source through the application port. Composition tells presentation whether Public search provider selection applies and which Settings surfaces the Research source in force governs; each surface states that for itself rather than hiding values the operator may be preparing.
