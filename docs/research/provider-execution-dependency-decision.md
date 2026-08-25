# Provider execution dependency decision

- **Status:** accepted for ADM-96
- **Decision owner:** Oliver Burleigh
- **Accepted:** 24 August 2026, through the instruction to implement ADM-96 using established libraries instead of custom scheduling and retry machinery
- **Evidence date:** 24 August 2026
- **Scope:** server-side search-provider requests in the local Job Radar process
- **Confidence:** high; the selected packages directly cover the required mechanisms and support the repository's Node 24 runtime

## Job and constraints

Discovery needs bounded concurrency and request rate, at most three attempts for transient failures, immediate termination for fatal provider failures, and cancellation that removes queued work and stops retry timers. Provider classification and persisted run diagnostics remain Job Radar policy. The packages must be maintained, MIT-compatible, ESM-compatible, testable without network access, and absent from the browser bundle.

## Options considered

| Candidate | Current evidence | Decision |
| --- | --- | --- |
| `p-queue@9.3.3` and `p-retry@8.0.0` | Both are MIT-licensed ESM packages. They require Node 20 and Node 22 respectively, so Node 24 is supported. `p-queue` provides concurrency, interval rate limiting, per-task `AbortSignal` cancellation, and backpressure. `p-retry` provides bounded exponential backoff, selective retry, attempt diagnostics, maximum retry time, and `AbortSignal` cancellation. Their npm unpacked sizes are about 84.5 KB and 25.5 KB. | **Combine.** Use `p-queue` for scheduling and `p-retry` inside each scheduled request. |
| `Bottleneck@2.19.5` and `p-retry` | Bottleneck covers concurrency and rate limits, but its npm package is about 629 KB unpacked and its registry metadata was last modified in February 2023. | Reject. It adds more and older mechanism than this local process needs. |
| `p-limit@7.3.1` and `p-retry` | Current, MIT, small, and Node 20 compatible, but it only limits concurrency. Rate limiting and queued-task cancellation would remain custom work. | Reject. It fails the request-rate and cancellation requirements without extra machinery. |
| Bespoke queue and backoff | Could be tailored exactly to Job Radar. | Reject. Timer, jitter, queue cancellation, fairness, and rate-window behavior are generic reliability mechanisms with avoidable long-term test and maintenance cost. |

## Decision and boundary

Adopt `p-queue@9.3.3` and `p-retry@8.0.0` behind the discovery infrastructure boundary. Application code owns provider-independent failure classes, skipped-query accounting, and run outcomes. Infrastructure maps HTTP responses to those classes and applies the execution policy. No package type crosses the application port.

Use no more than three total attempts. Retry only timeouts, `429`, and selected `5xx` responses with bounded exponential backoff and jitter. Authentication, payment or credit exhaustion, invalid requests, malformed responses, and configuration errors terminate the provider lane after one attempt. A shared run signal is passed to the queue, retry loop, and `fetch` call.

The dependencies run only in server-side discovery composition, so they do not enter the client bundle. Upgrade and advisory ownership stays with the Job Radar maintainer through the existing pnpm lockfile, Dependabot-compatible package metadata, `pnpm audit`, unit tests, browser gates, and focused mutation testing.

## Risks, exit, and review triggers

The strongest counterargument is that discovery currently executes queries sequentially, so a queue initially adds a dependency before all of its concurrency benefit is used. The package still provides the cancellation and rate-policy boundary required by ADM-96, and it allows later bounded parallelism without replacing that boundary.

Removal is local: replace the provider executor implementation while retaining the application port and its behavior tests. Re-evaluate on a major package release, a Node compatibility break, a security or license change, two years without a release, or repeated operational difficulty in cancellation or rate enforcement.

## Primary evidence

- [`p-queue` README](https://github.com/sindresorhus/p-queue): concurrency, `intervalCap`, strict rate limiting, backpressure, and shared-signal cancellation.
- [`p-queue` v9.3.3 release](https://github.com/sindresorhus/p-queue/releases/tag/v9.3.3): current release and rate-limiter correction.
- [`p-queue` MIT license](https://github.com/sindresorhus/p-queue/blob/main/license).
- [`p-retry` README](https://github.com/sindresorhus/p-retry): selective retry, bounded backoff, attempt callbacks, maximum retry time, and cancellation.
- [`p-retry` v8.0.0 release](https://github.com/sindresorhus/p-retry/releases/tag/v8.0.0).
- [`p-retry` MIT license](https://github.com/sindresorhus/p-retry/blob/main/license).
- npm registry metadata for `p-queue@9.3.3`, `p-retry@8.0.0`, `p-limit@7.3.1`, and `bottleneck@2.19.5`, queried 24 August 2026.
