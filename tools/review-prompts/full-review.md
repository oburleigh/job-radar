# Full Code Review Prompt

Review the branch named in the request. Lead with findings. Do not summarise
first, and do not restate what the branch does before saying what is wrong
with it.

For each finding:

- severity: `BLOCK`, `WARN` or `NOTE`
- file path and line number
- the specific construct involved
- why it matters, in terms of what a user of the product or a future maintainer
  would hit
- the smallest practical fix

`BLOCK` is for anything that breaks correctness, crosses an architecture
boundary the repository enforces, ships a control or a check that cannot do its
job, or fails an acceptance item the ticket claims is met. `WARN` is for what
should be fixed before the next slice. `NOTE` is low-risk cleanup only.

**A check that reports nothing is a `BLOCK`, not a `NOTE`.** The declared gate
in this repository once threw while loading a Playwright config, so no test ran,
nothing was reported, and the exit code was indistinguishable from a real
failure. A test that passes over broken code, or a suite that never executes, is
worse than no test, because it reads as coverage.

## What this product is

Job Radar is a local, single-user React Router application built with Vite,
backed by SQLite. It finds job opportunities and recruitment firms, ranks them
against a user's profile or search brief, and keeps the evidence behind every
result. Recruiter Search researches through the Codex CLI installed on the
machine; Opportunity Discovery pages public web search providers and known
company boards.

It runs on one person's machine against their own data. There is no multi-tenant
boundary and no untrusted user. What it has instead is a maintainer working
alone with agents, so the failure that costs most here is a check that looks
green while proving nothing, and a document that describes a repository that has
moved on.

Read `AGENTS.md` first. It carries the rules this repository has paid for, and
most of what follows is a pointer into it rather than a restatement.

## Pass 1: The architecture boundary

Business code is organised by bounded context under `src/contexts/<context>/`
with `domain`, `application`, `infrastructure`, `presentation`, `composition`
and `test-support`. `hexagon` is a boundary, not a directory.

Look for:

- `domain` importing React Router, Zod, Drizzle, Node APIs, `src/platform`, or
  any other layer. Domain holds business vocabulary and deterministic rules only
- `application` importing anything but its own `domain` and `application`
  modules. Ports belong to the innermost consumer, normally the application layer
- `presentation` importing `infrastructure`. It may reach its own `application`
  and `domain` plus context-neutral HTTP mechanisms in `src/platform`
- anything other than `composition` selecting a concrete adapter
- `src/platform` importing a context, or owning a schema, repository or product
  policy. Platform holds technical mechanisms shared by several contexts
- a cross-context import that does not go through the owning context's explicit
  public contract, or a barrel added before a second context needed one
- production code importing `test-support`
- `FormData`, `Request`, Drizzle rows or vendor payloads passed into application
  code. Each use case owns its provider-free command, result and port types
- a global `dto`, `types`, `schemas` or `utils` directory, or a shape that has
  drifted away from the boundary that owns it. Web request schemas live under
  `presentation/web/requests`; vendor and persistence schemas live beside the
  adapter that validates them
- an empty context or architecture directory created for future work

`tests/architecture/` enforces several of these. A finding there that the tests
do not already catch is worth more than one they do.

## Pass 2: Assertions that can actually fail

This is where a green suite has been wrong here, so review the tests as
carefully as the code.

For each test the branch adds or changes, ask:

- **can you name the production change that makes it fail?** If not, it is
  decoration. Say so
- does it assert shape, or today's data? A browser journey once required four
  named recruitment firms that live search happened to return on the day it was
  written. It failed for a reason that carried no information about the product,
  which is how a useful check becomes one people disable
- does it discriminate between plausible implementations, or replay the happy
  path? Cover variable inputs, boundaries, meaningful failure paths and
  observable side effects through the owning public interface
- does a mock stand where a real contract belongs? A mock proves the code's
  response to a collaborator. It does not prove that a CLI, a database, a
  browser or a provider accepts the real request. Every changed external
  boundary needs deterministic contract coverage *and* a focused smoke test
  against the real local boundary
- is a timing bound set after measuring, with at least an order of magnitude of
  headroom? A bound within a few percent of the measurement is a flake wearing a
  guard's uniform
- would the test still pass if the feature were deleted? Absence assertions
  (`toHaveCount(0)`) are the easy way to write one that always passes
- is any exit status read through a pipe? `cmd | tail` reports `tail`'s status,
  and a gate read that way has been reported green while failing
- does a browser journey assert the alignment, containment or order contract the
  change claims, or only that elements exist?

Also flag the test-layer question: a unit test driving internals directly where
the defect only appears through the route, the database or the browser.

## Pass 3: Product policy, configuration and secrets

Every new literal, default, list, limit, model choice and prompt phrase is
classified before it is added. Flag:

- product policy or a user-selectable value hardcoded in a production module.
  It belongs in typed SQLite-backed configuration exposed from Settings, or in
  the current command
- a provider prompt embedding a market, industry, specialism, target count,
  model or reasoning effort. Prompts are derived from the frozen run and its
  policy
- the same policy expressed in two places, or seeded defaults duplicated in code
- a secret anywhere but `.env`, or a secret missing from `.env.example`
- an environment-specific, deployment-specific or operator-changeable value in
  source. Stable domain and protocol constants may stay in code when they are
  part of a declared contract
- configuration read by a domain module. Domain receives typed policy objects
- a migration that depends on the developer's existing profiles, sources or
  history rather than working against an empty database

## Pass 4: The user-facing surface

Flag:

- a control that decides nothing on the path it renders on. Recruiter Search
  shipped a required provider select whose value the default research path
  discarded
- copy that names a mechanism the code no longer uses
- markup or CSS that recreates a `@job-radar/design-ui` component, a local copy
  of its styles, or a page-level selector overriding one. A visual deviation
  requires an explicit change to the owning design-system contract
- a structured domain list collected as delimiter-parsed free text, or a control
  whose accepted values are explained only by its placeholder
- a user-triggered asynchronous operation without immediate visible and
  announced feedback beside the action that started it. A disabled button, a
  pointer change, a bare spinner or a status below the fold is not enough
- lost keyboard access, invisible focus, a missing error state, or a light/dark
  divergence. Themes are equivalent, and colour comes from semantic CSS variables
- a business term that is not the canonical one in the context's `CONTEXT.md`
  Language section, or an old alias left behind after a rename. A broad synonym
  is not a substitute for the context's own term

## Pass 5: Over-engineering, in both directions

Complexity that buys nothing is waste, whatever else recommends it. Reading
well, generalising nicely, anticipating a second caller or mirroring another
tool is not justification.

Flag:

- custom non-domain code written without a market check: the existing code,
  installed dependencies, maintained packages, platform primitives and standards
  that could have satisfied the requirement. Hand-maintained standards-based
  reference data is the clearest case
- a library wrapped in speculative interfaces, its search or data model
  duplicated, or a parallel abstraction built for variation that does not exist
- an abstraction that hides no real variation. A search provider and an ATS
  protocol are real variation; one implementation behind an interface is not
- a helper that makes callers coordinate internal steps where one deep module
  with a narrow public API would do
- a parameter, flag or option with no caller in this change
- a monorepo package, barrel or shared module with no second consumer

And flag the opposite: a cut justified by a bound that does not state the
bound's value and what it is measured against.

## Pass 6: Documentation honesty

Flag:

- a `CONTEXT.md` describing a boundary the code has moved past. One here still
  called the public-web Source normal local use after the Codex Source became
  the default, and did not mention Codex at all
- a term used in code, UI copy, telemetry or tests that `CONTEXT.md` does not
  record, or records under a different name
- the README describing something the code no longer does, or does not yet do
- a roadmap item presented as a live capability, or an integration, protocol,
  certification or feature that does not exist
- a comment narrating what the line already says, naming a ticket, or repeating
  a number written down elsewhere. A tracker ID belongs in a commit, a plan or
  the tracker, not in runtime code
- a defect recorded only in a handoff, a commit message or a chat reply. Every
  defect gets a tracker issue, including one found and fixed in the same session
- a lesson recorded only in a handoff where it should be in `AGENTS.md` or in
  tooling, which are the only places read as rules

## Pass 7: Working safely on this machine

Flag:

- a gate or test script naming bare `pnpm build`. It writes to `build/`, which
  the user's running server serves.
  `tests/architecture/browser-build-isolation.test.ts` enforces this
- anything that bootstraps, migrates, restarts or writes to the user's SQLite
  database under `data/`, or restarts the dev server on `:5173`. Both are
  read-only evidence
- a throwaway script in a tracked path, or a checkout, worktree or cache under
  `/tmp`
- `pkill -f` with a pattern that also matches the invoking command line
- `data/`, environment files, generated reports or local agent tooling reaching
  Git

## Pass 8: Prose

For `AGENTS.md`, `CONTEXT.md`, the README, plans, commit messages and ticket
comments:

- inflated or generic wording, formulaic openings and closings
- em dashes, and dashes used as a style
- a claim stated as fact that was not measured, and hedging where something was
- a commit body line starting `word:`, which parses as a footer and fails
  commitlint
- a commit scope commitlint does not allow

## What the request will tell you

The request names the branch, its base, and the state its evidence is in. Take
that at face value: if it says a suite has not been run, do not report the
absence of that run as a finding. Report what the code would do when it does
run.

## Output format

Findings only, most severe first. If there are none:

```text
No findings.
```

Then, briefly: residual risk, and which assertions you checked and judged able
to fail.
