# Pending Linear issues from the 2026-09-01 audit

Twelve issues were created (ADM-269 to ADM-280) before the Linear workspace hit its free
issue limit:

```
You've exceeded the free issue limit for this workspace.
Please upgrade or contact sales@linear.app for a free trial.
```

The remaining issues are recorded here in creation order, ready to be filed in one pass once
the limit is lifted or issues are archived. Milestones `M9 Navigation and interface quality`
and `M10 Enforceable agent governance` already exist on the Job Radar project and are empty.

All should carry the `audit-2026-09` label. Source for every item:
`docs/audits/2026-09-01-audit.html`.

---

## M9 Navigation and interface quality

### 1. Opportunity workspace stops shipping job text the interface never renders
`Urgent` · `area: experience` `area: discovery` `area: quality` `Bug` · Size S

**Evidence.** `read-models/dashboard.ts:78-79` selects `description` and `rawPayload`. Line
93-98 spreads `...row`, 117-127 filters and slices the full objects, 145 returns them.
`job-card.tsx:11-33` declares neither field and no presentation consumer exists.

| Profile | Matched | description | raw_payload | Total |
| --- | --- | --- | --- | --- |
| 4 | 80 | 553,971 | 1,010,028 | **1,563,999** |
| 6 | 32 | 207,247 | 425,621 | 632,868 |
| 1 | 14 | 119,492 | 199,762 | 319,254 |

Mean per matched job across 140 rows: 6,995 bytes description, 12,789 bytes raw payload. Read
from a 1.14 GB SQLite file, serialised into the server-rendered HTML, serialised again into the
route `.data` response, parsed and hydrated. None rendered.

**Rule violated.** `AGENTS.md`: response DTOs must not expose persistence rows.

**Acceptance criteria**
- [ ] Both columns removed from the select list
- [ ] `evidence` retained; it has real readers in `isVerifiedJobListing` and `dedupeCrossSourceMatches`
- [ ] Route `.data` payload size for `/` measured before and after, recorded on the issue

**Gate.** Architecture check that read-model exports declare explicit return types. Eight of
nine currently infer, which is how persistence columns reach the browser unchosen.

---

### 2. Opportunity workspace stops blocking the event loop on every load
`Urgent` · `area: experience` `area: discovery` `area: quality` `Bug` · Size M

**Evidence.** `read-models/dashboard.ts:157-175`. Query plan is correct and covering; the cost
is row count. The `LIST SUBQUERY` materialises 85,412 job ids.

| Profile | Rows | Time |
| --- | --- | --- |
| 1 | 80,286 | 105.8 ms |
| 3 | 80,534 | 77.6 ms |
| 6 | 79,846 | 75.8 ms |
| 7 | 85,407 | 69.3 ms |
| 4 | 79,798 | 66.6 ms |

`better-sqlite3` is synchronous, so this blocks the whole event loop and every concurrent
request waits behind it. The repository's own report records Opportunities `.data` at
116.9 ms p95 against 12.7 to 19.7 ms for every other route.

Related pressure to fix alongside: `/runs/:runId` polls every 3 s with a full `SCAN jobs` at
109 ms (`runs.ts:177-230`, `run-detail.tsx:48-50`); `/recruiter-search` revalidates every
400 ms at 5+ reads per tick (`recruiter-research-page.tsx:133-139`); `api/discovery-runs`
performs an `UPDATE` on a `GET` (`discovery-runs.ts:32,45`).

**Acceptance criteria**
- [ ] Counts maintained incrementally in `store-matches.ts`, which already writes the `*_reason_count` columns, into a per-profile summary row
- [ ] Or denormalise `is_active` onto `job_matches` to remove the id materialisation; record which and why
- [ ] Opportunities `.data` p95 in line with other routes
- [ ] Run-detail poll no longer scans the full table per tick
- [ ] Recruiter poll backs off and stops when the run ends or the tab is hidden
- [ ] Status endpoint no longer writes on a `GET`

---

### 3. Navigation reuses loader data instead of refetching every route
`High` · `area: experience` `area: quality` `Improvement` · Size M

**Evidence.** Verified across the whole repository: zero matches for `shouldRevalidate`,
`clientLoader`, `prefetch`, `<Await>` or `Suspense`. No route defines `shouldRevalidate`, so
every navigation re-runs every matched loader in the tree. No `<Link prefetch="intent">`
exists anywhere.

The settings tree does not compound: `settings-layout.tsx`,
`settings-recruiter-search.tsx` and `settings-adapters-layout.tsx` are `Outlet` only with no
loaders. The root loader runs 3 reads on every navigation (`root.tsx:12-21`).

**Acceptance criteria**
- [ ] `shouldRevalidate` defined where a navigation cannot change the data
- [ ] `prefetch="intent"` on primary navigation links, so the loader runs on hover rather than click
- [ ] Perceived navigation time measured before and after against the corrected fixture

**Note.** A client query cache such as TanStack Query is not the answer here. It duplicates
React Router's own revalidation model and adds weight to a budget that is already over. The
wins are platform APIs already paid for.

---

### 4. Product styles enter the design system cascade
`High` · `area: experience` `Improvement` · Size M to L · **Blocked by ADM-277**

**Evidence.** `design-ui/styles.css:3` declares
`@layer job-radar.tokens, job-radar.reset, job-radar.components, job-radar.product;`.
`design-tokens/theme.css:1` wraps the whole file in the tokens layer;
`design-ui/styles.css:5-706` wraps every component rule in the components layer.

But `discovery/…/styles.css:3` opens `@layer job-radar.reset` and closes it at line 71, leaving
lines 73 to 2472 unlayered; `recruiter-engagement/…/styles.css` has no `@layer` at all across
997 lines. The declared `job-radar.product` layer is never opened by anything.

Per CSS Cascade Level 5, unlayered declarations sit in an implicit final layer that beats every
named layer regardless of specificity. Concretely `.utility-control` (`styles.css:221`,
specificity 0,1,0, unlayered) defeats `.jr-button[data-variant="secondary"]`
(`design-ui/styles.css:57`, specificity 0,2,0, layered) and imposes `border: 0`, `width: 68px`,
`min-height: 68px` on a design-system Button.

**This is not a two-line change.** Wrapping fixes design-system-versus-product conflicts only.
It does not reorder anything within the product sheet, so intra-product conflicts survive: for
example `.form-grid label > span` (`styles.css:390`) versus `.form-field > label > span`
(`styles.css:1141`) stay tied on specificity and resolved by source order.

**Acceptance criteria**
- [ ] Visual baselines exist and are green first (ADM-277)
- [ ] The 13 rules that currently override design-system components are converted to named public variants: `styles.css:391, 773, 898, 902, 921, 925, 935, 939` and five others
- [ ] Both product stylesheets wrapped in `@layer job-radar.product`
- [ ] Visual diff reviewed deliberately rather than accepted wholesale
- [ ] `@keyframes` moves are understood to be cosmetic; they are exempt from layer ordering

**Gate.** Stylelint rule failing any product CSS outside a layer, and any page-level selector
targeting a `.jr-*` class.

---

### 5. Type and elevation scales replace cramped text and flat borders
`High` · `area: experience` `Improvement` · Size M

**Evidence.** Token discipline in the product CSS is good; the token values are the problem.
At a 16px root (`design-tokens/theme.css:171-185`):

| Token | rem | px | Uses in discovery CSS |
| --- | --- | --- | --- |
| `micro` | 0.5 | **8px** | 9 |
| `label` | 0.5625 | **9px** | 15 |
| `caption` | 0.625 | **10px** | 13 |
| `xs` | 0.6875 | **11px** | 6 |
| `md` | 0.875 | 14px | 1 |
| `lg` | 1 | 16px | 1 |

43 of 65 font-size declarations are 11px or smaller, set in Barlow Condensed, a condensed face.

Elevation: exactly two shadow tokens, `--jr-shadow-raised` and `--jr-shadow-toast`
(`theme.css:207-208`), which are **byte-identical**. One elevation level does the work of a
scale, which is why 95 raw border declarations carry the visual structure. Radii stop at
`md` = 8px with no large step.

**Acceptance criteria**
- [ ] `micro` retired; body text moves to 14 to 15px
- [ ] Type scale has a stated ratio and every step earns its place
- [ ] A real elevation scale replaces border-carried structure
- [ ] A large radius step exists
- [ ] Contrast tests still pass in all three theme states
- [ ] Visual baselines regenerated deliberately

---

### 6. Storybook shows components as they ship
`Medium` · `area: experience` `Improvement` · Size S

**Evidence.** The Storybook preview loads tokens and `design-ui` only
(`.storybook/preview.ts:51-53`), never the product CSS that overrides them. So Storybook shows
components as designed while the application ships them as overridden, which is why the
catalogue looks right and the application does not.

Five of thirteen components have no story. `DESIGN.md:44-52` documents nine public components;
the package ships thirteen. Undocumented: `notification-badge`, `section-header`,
`select-field`, `tab-navigation`, `tooltip`.

Two of thirteen components, `Modal` and `Skeleton`, are used nowhere in the application.

**Acceptance criteria**
- [ ] Preview loads the product CSS so stories reflect what ships
- [ ] Every exported component has a story
- [ ] `DESIGN.md` lists the real public set
- [ ] Decide whether `Modal` and `Skeleton` are kept, used or removed

**Gate.** A story-coverage check failing when an export in `design-ui/src/index.ts` has no story.

---

## M10 Enforceable agent governance

### 7. Architecture tests enforce the rules that drifted
`High` · `area: quality` `Improvement` · Size M

**Evidence.** A census of every import across 368 files found **zero** violations of the rules
`tests/architecture/context-boundaries.test.ts` enforces, and drift in every rule it does not:

| Declared rule | Violations | Enforced? |
| --- | --- | --- |
| Composition is the only place selecting adapters | 8 | No |
| `src/platform` owns no schemas or product policy | 3 modules | No |
| Request schemas live in `presentation/web/requests` | 20 sites, 8 modules | No |
| Response DTOs must not expose persistence rows | 8 of 9 read-model exports infer their return type | No |
| Vendor schemas live beside their adapter | 1 module | No |
| Presentation must not import infrastructure | 0 | Partial: `assertInternalImportsStayInside` skips bare package specifiers |

Drift sites include `job-radar-config.ts:297,380,386` binding `db` via default parameters,
`platform/search/web-search-client.ts:60-152` holding three vendor Zod schemas plus a
`BRAVE_COUNTRIES` list and adapter selection, and `platform/http/location-autocomplete.tsx:104`
hard-coding Discovery's `/api/location-options` route, which is coupling by string that no
import checker can see.

**Acceptance criteria**
- [ ] Each rule above gains a mechanical check
- [ ] `assertInternalImportsStayInside` no longer skips bare package specifiers; decide denylist versus allowlist and record the reasoning
- [ ] Decide per rule whether to extend `context-boundaries.test.ts` or adopt `dependency-cruiser`; prefer extending the existing file where it is the cheaper path
- [ ] Any declared rule that cannot be mechanically enforced is deleted from `AGENTS.md` or restated as something checkable

---

### 8. Canonical vocabulary is enforced from CONTEXT.md
`High` · `area: quality` `Improvement` · Size S

**Evidence.** Both `CONTEXT.md` files define canonical terms with explicit `_Avoid_` alias
lists. Nothing checks them. Confirmed violations:

- `discovery/CONTEXT.md` lists **Opportunities** under `_Avoid_`; it is used on five surfaces including `app-navigation.tsx:48`, `jobs.tsx:64`, `activity.tsx:40-93`
- **scan** is listed under `_Avoid_` and used at `recruiter-research-page.tsx:452`
- `recruiter-engagement/CONTEXT.md` declares **Recruiter Search** canonical and explicitly avoids "Recruiter research as a feature or page label". The route is correctly `/recruiter-search`; the page component is `recruiter-research-page.tsx` and its route module is `recruiter-research.tsx`

`AGENTS.md` requires a behaviour test asserting the canonical term and rejecting the replaced
label. None exists.

**Care needed.** A raw grep returns 468 hits, but most are legitimate: `Research run` and
`Research criteria` **are** canonical terms. The check must target the avoided usage, not the
substring.

**Acceptance criteria**
- [ ] A check parses the Language section of each `CONTEXT.md` and fails on an avoided term in UI copy, route paths and component names
- [ ] A defined exemption mechanism covers legitimate canonical uses
- [ ] Existing violations are fixed or explicitly exempted
- [ ] Roughly 40 to 80 lines; lives beside the other architecture tests

---

### 9. Repository scans for secrets and vulnerable dependencies
`High` · `area: release` `area: quality` `Improvement` · Size S

**Evidence.** Verified absent: `.github/dependabot.yml`, `renovate.json`, any CodeQL or SAST
workflow, any secret-scanning configuration. `pnpm audit` appears at `README.md:829` and in
**zero** workflows or hooks.

`pnpm-workspace.yaml:16-26` lists 11 packages under `minimumReleaseAgeExclude` while
`minimumReleaseAge` is set nowhere and there is no `.npmrc`. Eleven carve-outs from a
cooling-off period that is not in force.

Other dependency findings: `isbot` is a production dependency with one occurrence repo-wide,
its own manifest line, and no `entry.server.tsx` exists. The `'hyperid>uuid'` override targets
a path the advisory does not use; the real path is via `@lhci/cli`. Stryker compiles with
TypeScript 6.0.3 pinned through `packageExtensions` while build and typecheck use 7.0.2, so
mutation testing runs against a different compiler than the build. All five current advisories
are dev-only transitive; there are **zero runtime advisories**.

**Acceptance criteria**
- [ ] `minimumReleaseAge` set, so the exclude list guards something real
- [ ] `pnpm audit` runs in CI at a defined severity threshold
- [ ] Secret scanning configured
- [ ] Dependency update automation configured
- [ ] `isbot` removed or used
- [ ] The uuid override retargeted or dropped
- [ ] The Stryker TypeScript pin resolved or documented as deliberate

---

### 10. AGENTS.md declares only what a machine enforces
`High` · `area: quality` `Improvement` · Size M

**Evidence.** 349 lines. Roughly a third is unenforceable as written, and every audit defect
sits in an unenforced rule. It declares a five-command gate that is neither a subset nor a
superset of the eleven CI steps, and one of its five, `pnpm test:e2e`, cannot run in CI because
it requires a live `BRAVE_SEARCH_API_KEY`.

The user's own standing rule: a rulebook that only grows stops being read, and an unread rule
binds nothing.

**Acceptance criteria**
- [ ] Every substantive rule classified enforced, partial, or prose only
- [ ] Prose-only rules either gain a check, convert to a checkable artefact such as a pull-request template field, or are deleted
- [ ] Content duplicated in `DESIGN.md`, `PERFORMANCE.md`, `CONTRIBUTING.md` or the `CONTEXT.md` files is removed from `AGENTS.md` and linked instead
- [ ] The declared gate matches `lefthook.yml` and `ci.yml` exactly
- [ ] A target length is agreed and met
- [ ] Consistency checked across `AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `.codex/`, `.impeccable/`, which are currently overlapping rulebooks

---

### 11. Sessions record a retrospective without being asked
`High` · `area: quality` `Improvement` · Size S

**Evidence.** `retrospectives/RETROSPECTIVE.md` does not exist. The user's global rulebook has
mandated an append-only retrospective at the end of every session, with NEW or REPEAT marking
described as "the whole point of the file", since day one. It has never been written in this
repository.

By the rulebook's own four-case diagnostic the failure is that the rule was written well, in a
place that was read, and still did not bind at the moment it applied. Its prescribed remedy is
a command shape the rule can be carried out by, or a control that fires at the moment of the
action rather than at the moment of reading.

**Acceptance criteria**
- [ ] A mechanism that fires at session end rather than relying on the agent remembering. A Claude Code Stop hook is the obvious candidate
- [ ] File format defined, append-only, newest last, gitignored
- [ ] NEW versus REPEAT determined mechanically where possible rather than by agent honesty
- [ ] A defined path by which a REPEAT escalates into a mechanical gate
- [ ] Proposed as reviewable content; configuration changes are the user's decision

---

### 12. Worktrees do not accumulate inside the repository
`Medium` · `area: quality` `Improvement` · Size S

**Evidence.** Six worktrees are registered inside the repository at `.worktrees/adm-179`,
`adm-200`, `adm-202`, `adm-206`, `adm-217`, `adm-218`, all on unmerged branches. They include
`feat/adm-202-navigation-performance`, abandoned work on the navigation lag that is still open.

The rule placing worktrees at `/home/ubuntu/code/worktrees/<TASK-KEY>/<repo>` and requiring
their creator to remove them lives in global `CLAUDE.md`, where this repository's tooling never
reads it. A stale worktree survives a reboot as a registration whose files are gone, at which
point the repository reports every file in it as deleted.

**Acceptance criteria**
- [ ] The six existing worktrees are reviewed, and each is either merged or removed with `git worktree remove --force`
- [ ] Stale local and remote branches pruned
- [ ] The rule moves to where it binds, or a check reports registered worktrees inside the repository

---

## M6 Recruiter research and controlled outreach

### 13. Recruiter Engagement domain enforces its invariants through types
`Medium` · `area: recruiter engagement` `area: quality` `Improvement` · Size M

**Evidence.** The two contexts are not built the same way.

| | Discovery | Recruiter Engagement |
| --- | --- | --- |
| Invariants | 4 smart constructors returning `null` or a tagged result; **zero `throw`** | **13 `throw new Error` sites** |
| Value objects | Branded `SearchProfileId`, `JobListingId`, `Currency`; `AnnualSalaryRange` repairs a reversed range | **Zero branded types, zero smart constructors** |
| Primitives | Moderate | Every id, `sourceUrl`, `observedAt`, `websiteUrl`, `profileUrl` is `string` |

Throw sites: `recruiter-directory.ts:147,202,207,222,926,934`, `research-run.ts:123,126,129,247`,
`shortlist.ts:56,188,196`. A malformed URL reaches `new URL(value)` at `observation.ts:48` and
throws, where the Discovery equivalent returns `null`. `observedAt` is a date held as a string
and re-parsed at `recruiter-directory.ts:722,748`.

The newer context abandoned the pattern the older one established, and nothing checked.

**Acceptance criteria**
- [ ] Branded types for the identifiers and URLs that currently travel as bare strings
- [ ] Smart constructors that reject illegal input at the boundary rather than throwing deep in reconciliation
- [ ] `observedAt` held as a date type, parsed once
- [ ] Parse-don't-validate applied consistently with Discovery

**Note.** Both domains are clock-clean: zero `Date.now()`, `randomUUID()` or `Math.random()` in
any domain or application production file. Time enters as an injected `asOf`. Preserve that.

---

### 14. Recruiter adapter policy comes from configuration, not from prose in a module
`Medium` · `area: recruiter engagement` `area: quality` `Improvement` · Size S

**Evidence.** `recruiter-engagement/infrastructure/public-web/public-web-policy.ts:16-40` and
`:45-70` hard-code roughly 14 policy literals in production code, including
`allowedPublicSourceScope`, `authorization.reviewedOn: "2026-08-31"`, `permittedOperations`,
`permittedPublicData` and `retention.rule`.

`AGENTS.md` requires product policy and operator-changeable values to come from typed
SQLite-backed configuration, with seed data as the single source of initial defaults.
`tests/architecture/recruiter-research-policy.test.ts` blocklists four strings in four
hard-coded files and does not detect these.

**Acceptance criteria**
- [ ] Policy values move to seeded configuration
- [ ] A dated authorisation review is data, not a literal in a module
- [ ] The policy architecture test detects embedded policy generally rather than four known strings
