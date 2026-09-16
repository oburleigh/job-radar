# Opportunity Tracking

Opportunity Tracking owns the jobseeker's pursuit of a Job listing after an explicit decision to
act. It records Applications, accepted Next actions, application-specific plans, and retained
history. Discovery remains the owner of Job listings, Search profiles, and Matches.

## Language

**Application**
: One jobseeker's recorded pursuit of one Job listing under one Search profile. It starts after an
explicit pursuit decision and keeps its timeline after the listing closes.
_Avoid_: Job, Match, Opportunity, submission

**Application stage**
: The current recorded step of an Application: Preparing, Applied, Screening, Interviewing, Offer,
or Closed. An explicit command changes the stage, and each change is retained in the Application
timeline.
_Avoid_: Status, pipeline state

**Next action**
: A concrete piece of work the jobseeker has accepted or created, with an owning record, reason,
state, and optional due time. Today orders open Next actions but does not own them.
_Avoid_: Task, to-do, recommendation

**Recommendation**
: An agent's proposed Next action or interpretation, supported by cited Evidence and not yet
accepted by the jobseeker. Dismissing a Recommendation does not alter the underlying facts.
_Avoid_: Action, instruction, decision

**Opportunity assessment**
: A structured, versioned evaluation of one Match against its Search profile and available Job
listing evidence. It supplements the deterministic Match and cannot rewrite its score or reasons.
_Avoid_: Match score, AI score, report

**Relationship plan**
: The application-specific plan for finding a credible human path before or alongside an
Application. It may reference existing Prospects and sourced public people without adding them to
the Recruiter Engagement Directory.
_Avoid_: Contact list, people directory, Campaign

**Application timeline**
: The append-only record of accepted stage changes, Next action changes, interviews, follow-ups,
and Outcomes for one Application.
_Avoid_: Activity, audit log

**Outcome**
: The jobseeker-confirmed conclusion of an Application, including hired, rejected, withdrawn, or no
response. An agent may propose an Outcome but cannot record it as confirmed.
_Avoid_: Result, completion reason

## Current boundary

The domain owns Application stages and state-change rules. Application use cases own pursuit starts,
Next action changes, timeline recording, and the ports they consume. Infrastructure stores these
records in context-owned SQLite tables. Presentation owns request validation and Application views.
Composition selects the concrete adapters and consumes other contexts through their public read
contracts.

Today is a workspace destination composed by the React Router application. It reads prepared models
from owning contexts and does not own a table or copy their records.

The local Advisor proposes Opportunity assessments and Relationship plans through the shared
platform Codex CLI client. Composition reads frozen Opportunity and Prospect inputs through public
context contracts. Infrastructure validates structured replies and resolves public-person evidence
through the configured web-search client. SQLite stores execution policy, versioned proposals and
Advisor attempt history; Activity consumes the public execution history contract. The jobseeker
controls execution policy in Settings and explicitly accepts or dismisses Recommendations.
