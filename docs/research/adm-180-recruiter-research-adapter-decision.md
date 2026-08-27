# ADM-180 local recruiter-research adapter decision

- Status: accepted
- Result: `local-codex-cli-web-search-v1`
- Decision owner: Oliver
- Evidence date: 2026-08-27
- Scope: one local user in the existing ChatGPT Business workspace. This decision authorises the local single-user UI integration. It does not cover hosted or multi-user deployment, or an exhaustive market dataset.

## Decision

Use `local-codex-cli-web-search-v1` for the local UAE technology recruiter-research command. It invokes the installed Codex CLI through `pnpm research:recruiters`, uses the existing ChatGPT Business-managed sign-in, and does not accept a user-supplied API key. The command is local and opt-in. It does not add a production host, browser automation, a logged-in LinkedIn session, or a stored research dataset.

The adapter starts one ephemeral Codex process in a fresh temporary directory with live web search, `gpt-5.6-terra`, medium reasoning, and a read-only sandbox. It removes `OPENAI_API_KEY` from the child environment without reading its value. It writes a controlled output schema and final-output location into that directory, forwards child progress and errors to stderr, validates only the completed final JSON file, prints accepted JSON to stdout, and removes the directory on success or failure.

The direct process boundary is custom infrastructure code. It is justified here because the maintained SDK route did not complete the required subscription-backed workload after two corrected attempts, while this smaller local CLI route did. ADM-75 may use this adapter in the Recruiter Engagement infrastructure layer for the authorised local single-user UI. ADM-75 owns its application port, durable run, result, and cancellation policy, and UI. Its composition selects the adapter. It must not expose a generic shell boundary.

## Maintained-route evaluation

The SDK was evaluated before selecting the direct adapter. Registry preflight found 0.150.1 current. Version 0.149.1 installed under the repository release-age policy, exposed the required local-thread, structured-output, read-only sandbox, live-search, model, and reasoning options, and passed deterministic adapter tests and repository gates. The Codex SDK is documented for programmatic use of local Codex threads in applications and internal tools. [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk)

The first corrected SDK proof exited 1 after 113.4 seconds without valid final JSON. The final authorised SDK proof ran with `OPENAI_API_KEY` absent and a 600-second bound. It exited 124 with zero result bytes and no final response. No facts, credentials, account data, provider transcript, or raw error payload were retained. The evidence does not show that the SDK is generally broken and does not prove an authentication failure. It shows only that the SDK route did not complete this required local workload within the authorised attempts.

The App Server remains deferred. Its documented managed-authentication, account, rate-limit, approval, and persisted-thread operations are deeper than a one-shot local command. [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server)

Direct CLI is therefore the smallest route with completed evidence for this spike. It owns only process launch, final-file validation, and temporary-file cleanup. Reassess the route before production hosting, multi-user use, provider account or rate-limit UX that requires App Server, or another expanded scope.

## Local policy and trust boundary

The command accepts a plain-language brief and a positive recruiter count. The default is 20 and there is no hard maximum. It asks for at least 10 distinct firms, unless a smaller requested recruiter count requires a lower firm count to preserve one recruiter per firm.

Research is limited to public web results and public LinkedIn profile URLs. It covers software engineering, data and AI, cloud and DevOps, cybersecurity, product, architecture, and technology leadership. Records contain only firm name, public HTTPS company URL, reason, industries, specialisms, named recruiter, title, firm, public HTTPS LinkedIn profile URL, observation date, and a supporting excerpt no longer than 280 characters.

The command prohibits private, candidate, contact, email, phone, CV, and messaging data. It does not access logged-in LinkedIn, cookies, LinkedIn DOM, browser or computer automation, social automation, or direct publisher requests from Job Radar.

The final JSON file is the only fact boundary. Child stdout and stderr are progress telemetry and never become facts. Local validation requires the requested recruiter count, distinct firms, a recruiter for every returned firm, distinct normalized public LinkedIn URLs, HTTPS URLs, observation dates, non-empty industries and specialisms, and excerpt limits. A startup failure, nonzero exit, missing final file, malformed JSON, or validation failure returns no accepted facts and removes the temporary directory. There is no automatic retry or resume.

The spike writes no database record, provider transcript, source record, or account data. Successful final JSON is printed to stdout for the local caller to handle. ADM-75 must define durable storage, deletion, correction, source removal, cancellation, and partial-failure behavior before this can back a product surface.

## Subscription boundary

OpenAI supports Codex clients signed in with an existing ChatGPT account. Availability and usage limits vary by plan, and the Business services agreement applies to Business use. [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540)

The command relies on the existing local managed sign-in and does not read, copy, print, log, or retain tokens, cookies, account email, session data, credential files, plan information, or rate-limit information. An unavailable sign-in, workspace restriction, usage-limit exhaustion, or search failure has the same local outcome: no valid result and no retry.

## Successful local proof

The direct CLI proof completed on 2026-08-27 in roughly two minutes with `OPENAI_API_KEY` unset. Its final JSON passed the local validator with 10 distinct UAE recruitment firms and 20 distinct named technology recruiters. Each returned firm had a recruiter, and the accepted records carried public HTTPS sources, public LinkedIn profile URLs, observation dates, evidence excerpts, industries, and technology specialisms.

Representative public firm sources from the accepted final file:

- [AIQU](https://aiqusearch.com/)
- [Auxo Talent](https://auxotalent.com/)
- [Charterhouse Middle East](https://www.charterhouseme.ae/)
- [Hays](https://www.hays.ae/)
- [Marc Ellis](https://marc-ellis.com/)
- [Michael Page](https://www.michaelpage.ae/)
- [Robert Walters](https://www.robertwalters.ae/)
- [TASC Outsourcing](https://tascoutsourcing.com/)

Representative public recruiter profiles from the same accepted final file:

- [Harry Brown](https://ae.linkedin.com/in/harry-brown-1875b4151)
- [Mark Paul](https://ae.linkedin.com/in/mark-paul-hays)
- [Ruwise Sheriff](https://ae.linkedin.com/in/ruwise)
- [Manpreet Kaur](https://ae.linkedin.com/in/manpreetkaur-data-and-ai)
- [Aisha Leigh](https://ae.linkedin.com/in/aisha-leigh-41475662)
- [Sophie Gray](https://uk.linkedin.com/in/sophiegrayauxotalent)
- [Chris Van Drew](https://www.linkedin.com/in/chris-van-drew)
- [Tommy Shepherd](https://www.linkedin.com/in/tommy-shepherd)

This proof establishes one bounded public-web research result. It does not establish complete UAE market coverage, recruiter availability, or source permanence.

## Revisit conditions

Revisit the decision if the Business agreement, workspace access, Codex CLI behavior, model availability, source permissions, or local data-handling requirements change. Reassess it before production hosting, multi-user use, provider account or rate-limit UX that requires App Server, or another expanded scope. The authorised local single-user ADM-75 UI is already within this decision.

## Primary sources

- [Codex SDK documentation](https://learn.chatgpt.com/docs/codex-sdk), checked 2026-08-27
- [Codex App Server documentation](https://learn.chatgpt.com/docs/app-server), checked 2026-08-27
- [Using Codex with a ChatGPT plan](https://help.openai.com/en/articles/11369540), checked 2026-08-27
