# ADM-180 local recruiter-research adapter decision

- Status: accepted
- Result: accepted adoption of `local-codex-cli-web-search-v1`
- Decision owner: Oliver
- Accepted by/date: Oliver / 2026-08-27
- Evidence date: 2026-08-27
- Scope: one local user on the existing ChatGPT Business workspace. This is a recruiter-research spike, not a hosted service or an exhaustive market dataset.

## Decision

Adopt `local-codex-cli-web-search-v1` for the local UAE technology recruiter-research spike. It runs the installed `codex` CLI directly through `pnpm research:recruiters`, using the existing ChatGPT Business login. It does not add an SDK dependency, accept a user-supplied agent or API key, automate a browser, or introduce a production host.

The installed CLI reported `codex-cli 0.149.1` on the evidence date. The command starts one `codex exec` process with live web search, `gpt-5.6-terra`, medium reasoning effort, an ephemeral execution option, and a read-only sandbox. It runs from an empty temporary directory. The command writes a controlled output schema and a last-message path there, forwards progress and errors to stderr, accepts facts only from the final JSON file, then removes the temporary directory on success or failure. Its process boundary removes `OPENAI_API_KEY` from the child environment without reading its value.

This is a local working route, not a claim that direct CLI process management is the preferred production integration. The [Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli) describes live web search for current external context and non-interactive repeatable workflows. The direct command has passed the user-approved local proof, so it is the appropriate small mechanism for this spike.

## Authorization and account boundary

The account is user-confirmed ChatGPT Business. OpenAI instructs users to sign in to Codex with their ChatGPT account and lists the CLI as a supported client; it says the corresponding online services agreement applies to Business users signing in to Codex. Codex availability and usage limits vary by plan. [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540) was refreshed on 2026-08-27.

The current [OpenAI Services Agreement](https://openai.com/policies/services-agreement/) applies to ChatGPT Business. It permits use under the agreement, prohibits extracting data except as permitted through the Services, sharing individual login credentials, and bypassing usage limits or protective measures. It also places responsibility for input rights and output evaluation on the customer. This decision is an engineering interpretation of the user-confirmed Business workspace, the agreement, and the documented CLI. It is not legal advice, does not supersede the workspace policy or Order Form, and must be revisited if any of them changes.

No login token, account email, cookie, session, or credential file is read, copied, logged, or retained. The CLI uses its existing managed sign-in. The command neither configures provider retention nor makes a claim about it; provider handling remains subject to the governing agreement and workspace controls.

## Successful local proof

The corrected local run exited 0 on 2026-08-27 with a schema-valid final result containing 10 distinct UAE recruitment firms and 20 distinct named recruiters with public LinkedIn profile URLs. Every retained record carried the observation date, a concise evidence excerpt, and the company industry and technology-specialism fields required by the command. This proves a bounded public-web research run. It does not establish complete UAE market coverage, recruiter availability, or source permanence.

Representative public firm records from that final result:

- [AIQU](https://aiqusearch.com/)
- [Auxo Talent](https://auxotalent.com/)
- [Charterhouse Middle East](https://www.charterhouseme.ae/)
- [Hays](https://www.hays.ae/)
- [Marc Ellis](https://marc-ellis.com/)
- [Michael Page](https://www.michaelpage.ae/)
- [Robert Walters](https://www.robertwalters.ae/)
- [TASC Outsourcing](https://tascoutsourcing.com/)

Representative public recruiter-profile records from the same final result:

- [Harry Brown](https://ae.linkedin.com/in/harry-brown-1875b4151)
- [Mark Paul](https://ae.linkedin.com/in/mark-paul-hays)
- [Ruwise Sheriff](https://ae.linkedin.com/in/ruwise)
- [Manpreet Kaur](https://ae.linkedin.com/in/manpreetkaur-data-and-ai)
- [Aisha Leigh](https://ae.linkedin.com/in/aisha-leigh-41475662)
- [Sophie Gray](https://uk.linkedin.com/in/sophiegrayauxotalent)
- [Chris Van Drew](https://www.linkedin.com/in/chris-van-drew)
- [Tommy Shepherd](https://www.linkedin.com/in/tommy-shepherd)

The document retains only this representative public decision evidence. The command itself creates no database or durable source record. Its raw schema and final-output files are temporary and are deleted in a `finally` path. On success it prints clean JSON to stdout; a caller decides whether to retain it. ADM-75 must define canonical storage, deletion, correction, and source-removal behavior before product use.

## Initial Adapter Policy: `local-codex-cli-web-search-v1`

### Enablement and request

- The command is opt-in and local only. No application route, scheduler, worker, or host invokes it automatically. When disabled, it makes zero Codex or web requests.
- A caller supplies a plain-language brief and may supply a positive recruiter-count option. The typed request owns that target, with a default of 20 and no hard maximum.
- The command requires at least that many distinct public LinkedIn profile URLs after normalization. It uses a firm floor of 10, reduced only if a smaller recruiter target is needed to preserve one recruiter per firm.
- The prompt must cover software engineering, data and AI, cloud and DevOps, cybersecurity, product, architecture, and technology leadership. Industries named in the brief guide priority. Without them, it covers major UAE technology-hiring sectors.

### Allowed sources and retained fields

- Codex live web search may use public web results to identify recruitment firms and public LinkedIn profile results for named recruiters.
- A company record is limited to name, HTTPS company URL, reason, industries, specialisms, evidence excerpt of at most 280 characters, and observation date.
- A recruiter record is limited to name, title, company, public HTTPS LinkedIn profile URL, evidence excerpt of at most 280 characters, and observation date.
- The final JSON validator requires the requested recruiter minimum, distinct company names, one recruiter for every returned company, HTTPS URLs, public LinkedIn profile paths, non-empty industry and specialism lists, dates, excerpt length, and distinct normalized LinkedIn URLs.

### Prohibited data and operations

- No private, candidate, contact, email, phone, CV, or messaging data.
- No logged-in LinkedIn session, cookie, extension, social DOM extraction, browser or computer automation, messaging, or direct publisher request from Job Radar.
- No API key, SDK package, App Server client, production host, background mode, resume, or automatic retry.

### Evidence, budgets, and failure behavior

- The final JSON file is the only fact boundary. Child stdout and stderr are progress telemetry and are never parsed into facts.
- The recruiter target is an output-evidence threshold, not a provider-enforced web-query, page, token, or cost budget. The current command has no trusted price or usage meter and must not invent one.
- If the CLI process cannot start, exits nonzero, produces no final file, produces malformed JSON, or violates the controlled schema, the command writes a visible stderr failure, returns no accepted facts, and removes the temporary directory. It does not retry or resume.
- An unavailable login, a workspace restriction, a subscription or rate-limit exhaustion, or a search-tool failure has the same current failure outcome: no valid result and no retry. The command does not classify those failures or retain partial output.
- Source visibility is limited to the selected company and profile URLs in the final JSON. The current spike has no durable record of skipped, inaccessible, unsupported, or rejected sources.

## Candidate comparison

### Direct Codex CLI

Selected for the current local spike. It is installed, authenticated through the existing Business login, supports the required live search and non-interactive execution, and passed the 10-firm and 20-recruiter proof. The application owns only the small process launch, final-file validation, and cleanup boundary while this remains a local command.

### Codex SDK

Deferred. The [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk) describes programmatic control of local Codex for internal tools and applications. It is a maintained option when Recruiter Engagement becomes an in-process application integration, but adding it now would expand this local spike without a demonstrated need.

### Codex App Server

Deferred. The [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server) covers managed ChatGPT authentication, account and rate-limit events, approvals, and persisted thread operations. Those lifecycle responsibilities are unnecessary for this one-shot local command and belong in a later design only if ADM-75 needs them.

### No adapter

Not selected because it cannot perform the approved local research. The opt-in policy above remains disabled until a user explicitly invokes the command and the local preconditions hold.

## ADM-75 initial contract and dependency boundary

ADM-75 remains blocked only by ADM-74 after this accepted decision.

ADM-75 may use this spike as evidence, but it must not claim that the current command already provides product behavior. ADM-75 must add a Recruiter Engagement application request that carries the user-controlled recruiter target and brief, an explicit source plan, durable partial results, source failures and inaccessible-source outcomes, coverage status, cancellation, canonical persistence, retention and deletion, and observable subscription-limit handling. It must make the resulting policy visible to the local user.

If ADM-75 turns this into application code, its port belongs in the Recruiter Engagement application boundary, its direct CLI adapter belongs in that context's infrastructure, and composition selects it. Job Discovery remains separate. There is no generic shell API.

Re-evaluate this decision when the ChatGPT Business agreement, workspace access, CLI behavior, model availability, source permissions, or local data-handling requirements change; when a hosted or multi-user route is requested; or when ADM-75 needs durable, resumable, or approval-driven behavior. A production proposal must compare the maintained SDK and App Server again before selecting an integration.

## Primary evidence

- [Codex CLI documentation](https://learn.chatgpt.com/docs/codex/cli), refreshed 2026-08-27. It documents live web search and non-interactive repeatable CLI workflows.
- [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540), refreshed 2026-08-27. It documents ChatGPT sign-in, CLI availability, plan-varying limits, and the Business agreement boundary.
- [OpenAI Services Agreement](https://openai.com/policies/services-agreement/), effective 2026-01-01 and refreshed 2026-08-27. Sections 2.1, 3.3, and 4.1 through 4.3 govern service use, restrictions, output ownership, provider content handling, and customer responsibility.
- [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk), refreshed 2026-08-27. It is the deferred maintained application-integration candidate.
- [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server), refreshed 2026-08-27. It is the deferred deeper lifecycle-integration candidate.
