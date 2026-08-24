# Recruiter Engagement MVP — Product and Domain Specification

**Status:** Draft for review  
**Date:** 24 August 2026  
**Product context:** An independent feature within an existing job-discovery platform

## 1. Product summary

Recruiter Engagement helps a jobseeker identify the recruitment firms and individual recruiters most relevant to a specialist search, organise those contacts, and run a configurable outreach campaign.

The first user is the product owner, running the feature locally on a laptop. The MVP is intended to validate whether evidence-backed recruiter research plus controlled outreach materially improves a real job search. It is not initially a multi-tenant global data platform.

Example brief:

> Find leading technology recruiters in the UAE who work on product leadership, AI, and senior technology roles.

The system researches relevant firms and team members, explains and sources its recommendations, discovers available contact routes, supports granular email and LinkedIn workflows, and records subsequent engagement.

## 2. MVP outcome

A user can:

1. Describe an area of expertise, desired work, and target geography.
2. Start a background research run and see partial results while it progresses.
3. Review evidence-backed recruitment firms and relevant individual recruiters.
4. Shortlist people and resolve missing or conflicting contact information.
5. Construct an outreach sequence in which each action is independently disabled, manual, approval-based, or automatic.
6. Assign templates, CV versions, meeting links, timing, and stop conditions to individual steps.
7. Approve and launch the campaign.
8. Track connection requests, emails, direct messages, replies, follow-ups, and meetings.
9. Reuse accumulated research in later searches while refreshing stale facts.

The MVP is successful if the example UAE technology brief produces a genuinely useful target list and enables the user to progress from research to real recruiter conversations without maintaining a separate spreadsheet.

## 3. Scope

### Included

- Natural-language search briefs with editable structured criteria.
- Asynchronous, resumable web research.
- Discovery of recruitment firms, team members, specialties, locations, public profiles, and public work-email evidence.
- Source provenance, observation date, confidence, and manual correction.
- Progressive local directory with identity resolution and deduplication.
- Explainable firm and recruiter matching.
- Shortlists.
- Reusable message templates and variants.
- Granular multi-step outreach campaigns.
- Email sending and reply synchronisation through one mailbox adapter.
- Manual or automated LinkedIn actions when supported by the configured adapter.
- Staggered sending, delays, limits, and stop-on-response behaviour.
- Optional Calendly or equivalent booking link inserted into chosen messages.
- Versioned CV storage and selection of a specific CV for an outreach step.
- A relationship timeline and lightweight engagement pipeline.
- Optional references to facts produced by Job Discovery.

### Excluded from this MVP

- Multi-tenancy, subscriptions, roles, and organisation administration.
- A pre-crawled global recruiter database.
- Guaranteed exhaustive coverage of every recruitment company.
- Paid contact-enrichment providers unless a simple adapter already exists.
- AI rewriting of CVs for individual vacancies.
- Automated legal classification for every jurisdiction.
- A general-purpose visual workflow builder.
- Complex analytics, experiments, and template optimisation.
- A hard dependency between Job Discovery and Recruiter Engagement.

## 4. Bounded contexts

### Recruiter Engagement

Owns search briefs, research runs, recruiter observations, the progressive directory, shortlists, campaigns, contact attempts, and relationship status.

### Job Discovery

Owns job-source discovery, job listings, and job-search behaviour. It remains operationally independent.

The contexts may exchange published facts through an integration layer:

- Job Discovery may supply an employer, vacancy, location, specialty, job URL, or recruiter clue.
- Recruiter Engagement may supply recruitment-company websites or newly discovered job-board sources.
- Cross-context identifiers are optional references rather than required fields.
- Neither context reads or writes the other context's internal persistence.

## 5. Ubiquitous language

| Term | Meaning |
|---|---|
| **Search Brief** | The user's description of the recruiters they want to find, including expertise and geography. |
| **Research Run** | One resumable execution of the research process for a Search Brief. |
| **Observation** | A sourced claim discovered during research; it is not yet canonical truth. |
| **Recruitment Firm** | A canonical organisation that provides recruitment or search services. |
| **Recruiter** | A canonical professional associated with a Recruitment Firm. |
| **Evidence** | The source URL, excerpt or extracted fact, observation time, and confidence supporting an Observation. |
| **Prospect** | A Recruiter selected for possible engagement by the user. |
| **Shortlist** | A user-curated collection of Prospects. |
| **Campaign** | An approved outreach objective, audience, and ordered sequence of Campaign Steps. |
| **Campaign Step** | One configured action, such as sending an email or requesting a LinkedIn connection. |
| **Execution Policy** | The degree of automation permitted for a Campaign Step. |
| **Contact Attempt** | The recorded execution or manual completion of a Campaign Step for one Prospect. |
| **Engagement** | The evolving relationship between the user and a Prospect. |
| **Career Asset** | A versioned CV or other document that may be assigned to an outreach step. |

## 6. Architecture

Recruiter Engagement is organised into four deep modules with small interfaces.

### Research

Accepts a Search Brief, manages a resumable Research Run, and produces sourced firm and recruiter Observations. It hides query expansion, source selection, web traversal, extraction, retries, and agent orchestration.

### Directory

Resolves Observations into canonical Recruitment Firms and Recruiters. It handles identity matching, deduplication, conflicts, evidence history, freshness, confidence, and ranking. An agent may propose facts but cannot directly overwrite canonical records.

### Campaigns

Turns Prospects into an ordered outreach sequence. It owns templates, variants, execution policies, conditions, schedules, limits, approvals, asset assignment, and release of due actions.

### Engagement

Records Contact Attempts and derives the current relationship state. It combines automated channel events and user-recorded manual actions into one timeline.

The principal workflow is:

```text
Create Search Brief
      ↓
Start Research → Review Results → Create Shortlist
                                      ↓
                              Configure Campaign
                                      ↓
                               Approve Campaign
                                      ↓
                           Execute Eligible Steps
                                      ↓
                           Record Replies/Meetings
```

## 7. Ports and adapters

The domain does not contain provider-specific behaviour.

### Research execution

The application creates a durable Research Run and invokes a background research adapter. An OpenAI Responses implementation may use background execution, web search, MCP tools, and typed functions. Its output must conform to the application's structured Observation contract.

### Outreach channels

Every channel adapter declares its capabilities rather than forcing the core to assume feature parity:

```text
discover_profile
prepare_content
execute_connection_request
execute_message
execute_email
attach_file
read_delivery_state
read_response
```

Initial channel adapters are:

- **Mailbox adapter:** sends email and synchronises replies.
- **LinkedIn adapter:** exposes the operations supported by its configured implementation, including manual preparation and automated execution where available.

If a requested capability is unavailable, the affected step is marked `Blocked` with a clear explanation. The system must not silently downgrade an automatic step to manual or report an unexecuted action as completed.

### Scheduling

The MVP treats a booking system as a configured URL. A campaign step may insert or omit that link. Calendar availability synchronisation is outside MVP scope.

### Persistence

The existing platform's persistence technology stores domain state. Large raw research artefacts may be stored separately, while canonical records retain structured Evidence references.

## 8. Background research behaviour

The user supplies free text and may edit the extracted criteria:

- Specialist areas and related terminology.
- Target countries, regions, or cities.
- Desired functions and seniority.
- Permanent, contract, interim, or executive work.
- Optional employers, exclusions, and keywords.

The Research module then:

1. Expands the brief into focused queries.
2. Finds candidate recruitment firms from public web sources.
3. Inspects company websites and relevant team pages.
4. Finds individual recruiters and their professional profiles.
5. Searches for public work-contact routes.
6. Emits sourced Observations as they become available.
7. Reconciles Observations with the existing local directory.
8. Reports coverage, source failures, and completion reasons.

A Research Run finishes when its configured research budget is reached, all discovered high-priority firms have been inspected, or two consecutive expansion rounds find no new canonical firms. The result is described as comprehensive research within the run's sources and budget, never as a guaranteed list of every firm.

Research Runs are durable and may be retried, cancelled, or refreshed. A retry must not duplicate canonical firms, recruiters, or Contact Attempts.

## 9. Matching and ranking

Results are ordered by an explainable match score rather than an unsupported claim that a firm is globally “leading.” The MVP score uses:

- Specialist-area match: 35%.
- Geographic relevance: 20%.
- Evidence of relevant current activity or vacancies: 15%.
- Recruiter role and seniority relevance: 15%.
- Evidence freshness and quality: 10%.
- Contactability: 5%.

The interface displays the strongest reasons and supporting sources. Users may sort or filter by firm, recruiter, specialty, location, confidence, freshness, and contact route.

## 10. Interface structure

The feature should use the existing platform shell and design conventions. It needs five functional views, but they may be implemented as existing page patterns, tabs, drawers, or routes.

### Recruiter search

Create and refine a Search Brief, start research, and observe progress.

### Research results

Group results by Recruitment Firm with relevant team members nested beneath it. Show match reasons, evidence, freshness, public profiles, work-email confidence, and existing engagement state.

### Shortlist

Review selected Prospects and resolve duplicates, prior contact, missing channels, or conflicting facts before campaign creation.

### Campaign builder

Define recipients, steps, execution policies, message variants, timing, limits, conditions, booking links, and Career Assets. Preview the effective sequence for representative recipients before approval.

### Engagement workspace

Show the relationship pipeline, due work, responses, meetings, and a unified timeline for each Recruiter.

## 11. Granular automation model

Automation is configured per Campaign Step, not per campaign or channel.

Each step has one Execution Policy:

| Policy | Behaviour |
|---|---|
| **Disabled** | The step is not used. |
| **Manual** | The system prepares the information or content; the user performs the action and records completion. |
| **Draft for approval** | The system prepares the action and waits for explicit approval for each Prospect. |
| **Automatic** | The system executes when its schedule and conditions are satisfied, after the Campaign itself has been approved. |

Each Campaign Step independently configures:

- Channel and action.
- Execution Policy.
- Template and variant assignment.
- AI personalisation on or off.
- Delay from the previous eligible event.
- Allowed days and times.
- Daily execution limit.
- Preconditions and skip conditions.
- Booking-link inclusion.
- Career Asset attachment or omission.
- Failure behaviour.

An example campaign is:

| Order | Action | Policy | Timing | Content/options |
|---:|---|---|---|---|
| 1 | LinkedIn connection request | Automatic | Day 0 | Personalised connection note; no CV. |
| 2 | Email introduction | Draft for approval | Day 1 | Template A or B; attach `Technology-Leadership-CV v4`; include booking link. |
| 3 | LinkedIn direct message | Automatic | After connection accepted | Template C; no attachment. |
| 4 | Email follow-up | Automatic | Five days after email | Template D; omit CV; include booking link. |
| 5 | Reminder task | Manual | Seven days later | Ask user to review the relationship. |

The scheduler evaluates each Prospect independently. A reply, meeting, decline, suppression, or manual stop immediately prevents later automatic outreach unless the user deliberately resumes it.

Dependencies are explicit. For example, a direct message configured for “after connection accepted” cannot run merely because its delay elapsed. A CV can only be attached when the selected channel adapter supports attachments.

## 12. Templates and personalisation

A template contains a subject where applicable, message body, supported variables, and channel constraints. Variables may include:

- Recruiter and firm names.
- Relevant specialty and geography.
- Evidence-backed reason for contacting that person.
- User's target role and short professional summary.
- Booking link.
- Career Asset name.

AI personalisation may be enabled per step. Generated text must remain a draft until the configured Execution Policy permits execution. The UI shows the final rendered content before campaign approval and retains the exact sent content in the Contact Attempt.

Template variants may be assigned manually or distributed across recipients. Performance optimisation and statistical experimentation are outside the MVP.

## 13. Career Asset library

The MVP supports storing versioned CVs with:

- Stable Career Asset identity.
- Version number and upload date.
- Display name and optional tags.
- Original file.
- Active or archived state.

A Campaign Step references an immutable version, ensuring that later CV edits do not change an already approved or sent message. AI tailoring a CV against a vacancy is a separate future feature.

## 14. Engagement lifecycle

The current status is derived from recorded events rather than freely overwritten text:

```text
Discovered → Shortlisted → Drafted → Scheduled → Contacted
                                                  ├─ Replied
                                                  ├─ Follow-up due
                                                  ├─ Meeting booked
                                                  ├─ Declined
                                                  └─ Closed
```

One Recruiter may appear in multiple searches and shortlists but has one relationship timeline for the user. Campaign membership and individual Contact Attempts remain independently auditable.

## 15. Failure and recovery

- Source pages that cannot be accessed are recorded as unavailable; the agent continues with remaining sources.
- Unsupported channel operations block only the affected Campaign Step.
- Low-confidence identity matches remain separate until reviewed.
- Conflicting facts are preserved as competing Observations rather than silently overwritten.
- Email or LinkedIn execution failures are retryable but never recorded as sent without provider confirmation.
- Retries use an idempotency key per Prospect and Campaign Step to prevent duplicate actions.
- Pausing a Campaign prevents new actions but does not alter completed Contact Attempts.
- A response stops future automatic steps for that Prospect.
- Missing or archived Career Asset versions block only steps that require them.
- Interrupted Research Runs and Campaign execution resume from durable state.

## 16. MVP privacy and safety baseline

The local-first MVP avoids a full global compliance system but retains the minimum information needed to behave responsibly and support later distribution:

- Store the source URL and observation date for discovered personal information.
- Keep user messages, CVs, notes, and engagement history private.
- Do not infer sensitive personal attributes.
- Allow correction, deletion, and a “do not contact” state.
- Stop automation immediately when the user pauses a Campaign or a Prospect responds.
- Keep mailbox, model-provider, and channel credentials outside domain records and protected using the platform's secret-storage mechanism.
- Require explicit Campaign approval before any automatic action becomes eligible.
- Display that automated channel behaviour depends on the configured adapter and third-party platform conditions.

Broader jurisdictional policy packs, shared-directory governance, and platform-specific distribution review are deferred until the product moves beyond a private local MVP.

## 17. Acceptance criteria

The MVP is accepted when all of the following are demonstrated:

1. A user can submit the UAE technology example brief and receive partial results during a background Research Run.
2. Returned firms and Recruiters include match explanations, Evidence links, freshness, and confidence.
3. Repeated or refreshed research does not create obvious duplicate canonical records.
4. A user can create a Shortlist from multiple firms.
5. A Campaign can contain email, LinkedIn connection, LinkedIn message, and manual-task steps in one ordered sequence.
6. Every step independently supports Disabled, Manual, Draft for approval, or Automatic policy when allowed by its adapter.
7. The user can independently toggle personalisation, a booking link, and a chosen immutable CV version on relevant steps.
8. No automatic action executes before Campaign approval.
9. A scheduled email is sent once and its exact content is recorded.
10. A configured automated LinkedIn action is attempted once, with its confirmed result or failure recorded.
11. A manual step can be marked completed without claiming that the system executed it.
12. A reply updates Engagement and cancels later automatic follow-ups for that Prospect.
13. Research or execution can resume safely after interruption without duplicate contact.
14. Job Discovery and Recruiter Engagement each function when the other is unavailable.

## 18. Testing strategy

Tests cross the same module interfaces used by production callers.

- **Research contract tests:** structured observations, provenance, partial results, cancellation, retry, and malformed agent output.
- **Directory tests:** identity resolution, conflicting evidence, refreshes, deduplication, and deterministic score calculation.
- **Campaign tests:** every Execution Policy, conditional steps, scheduling, limits, pause/resume, stop-on-response, and immutable asset references.
- **Adapter contract tests:** capability declarations, successful execution, unsupported operations, transient failure, confirmed failure, and idempotent retry.
- **Engagement tests:** event-derived state and timelines spanning multiple Campaigns.
- **Journey test:** Search Brief through research, shortlist, mixed-automation Campaign, email/LinkedIn outcomes, response, and cancelled follow-up.

The agent and external channels are replaced by deterministic fakes in automated tests. A small opt-in live test suite verifies configured external adapters without running as part of every test execution.

## 19. Deferred extensions

- Shared global recruiter directory with formal privacy governance.
- Additional research, enrichment, email, social, messaging, and scheduling adapters.
- Job-specific recruiter suggestions initiated from Job Discovery.
- Job-board discovery initiated from Recruitment Firm records.
- AI-assisted CV selection and truthful job-specific tailoring.
- Campaign analytics and template experimentation.
- Team collaboration and shared relationship ownership.
- Jurisdiction-aware outreach policy packs.
- Recruiter-side profiles, verification, and inbound candidate interest.

## 20. Reference constraints

- The OpenAI Responses API supports background responses and built-in or custom tools, making it suitable for the proposed asynchronous Research Run adapter: <https://developers.openai.com/api/reference/cli/resources/responses/methods/create>
- Third-party channel capabilities and terms may change. The domain therefore relies on adapter-declared capabilities and records actual outcomes rather than assuming that every provider supports automated execution.
