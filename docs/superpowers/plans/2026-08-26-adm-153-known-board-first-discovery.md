# ADM-153 Known-Board-First Discovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the app owner start one discovery run that refreshes enabled known boards before optional web coverage, retains successful work after lane failures, and reports one consistent outcome everywhere.

**Architecture:** Keep orchestration in the discovery-runs application layer. A work planner decides whether a run has board or web work before reservation. The existing discovery use case will execute known-board sync, optional web coverage, and one final match evaluation while the journal records phase and lane evidence. A pure outcome function will map that evidence to `running`, `completed`, `partial`, `failed`, or `cancelled` for every read surface.

**Tech Stack:** TypeScript, React Router, React 19, Drizzle ORM, SQLite, Vitest, Playwright, Stryker, Biome

**Spec:** `.handoff/current.md` and [ADM-153](https://linear.app/innovatioai/issue/ADM-153/app-owner-runs-known-board-first-discovery-with-one-action)

## Global Constraints

- Preserve `docs/research/discovery-search-audit.md` and `plans/`.
- Keep the Sources page manual refresh as registry maintenance.
- Do not add scheduled execution, Cloudflare hosting, retries, unchanged-board optimization, or detailed source-contribution reporting.
- Use current React Router fetch and pending-state behavior. Keep keyboard access, visible focus, status announcements, cancellation, responsive layout, and theme parity.
- Do not commit or push without explicit user approval.

---

### Task 1: Admission without a required web provider

**Files:**

- Modify: `src/contexts/discovery/application/discovery-runs/ports/discovery-run.ts`
- Modify: `src/contexts/discovery/application/discovery-runs/start/start-discovery-run.ts`
- Modify: `src/contexts/discovery/application/discovery-runs/start/start-discovery-run.test.ts`
- Create: `src/contexts/discovery/application/discovery-runs/start/plan-discovery-run-work.ts`
- Create: `src/contexts/discovery/application/discovery-runs/start/plan-discovery-run-work.test.ts`
- Modify: `src/contexts/discovery/presentation/web/http/start-discovery-run.ts`
- Modify: `src/contexts/discovery/presentation/web/http/start-discovery-run.test.ts`
- Modify: `src/contexts/discovery/composition/discovery-runs.server.ts`

**Interfaces:**

- `StartDiscoveryRunCommand.providerName` becomes `string | null`.
- `DiscoveryRunWorkPlan` is `{ knownBoardCount: number; webRequestCount: number }`.
- `ForPlanningDiscoveryRunWork.plan(command)` returns the work plan without writing data.
- `StartDiscoveryRunResult` adds `{ status: "not-runnable" }`.

- [ ] **Step 1: Write failing application tests for board-only, web-only, mixed, and empty admission**

```ts
it("starts a board-only run without a provider", () => {
  const starter = createDiscoveryRunStarter({
    work: { plan: () => ({ knownBoardCount: 2, webRequestCount: 0 }) },
    registry,
    scheduler,
  });

  expect(starter.startDiscoveryRun({ profileId: 7, providerName: null })).toEqual({
    status: "started",
    runId: 41,
  });
});

it("does not reserve an empty run", () => {
  const result = starter.startDiscoveryRun({ profileId: 7, providerName: null });
  expect(result).toEqual({ status: "not-runnable" });
  expect(registry.reserve).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the focused tests and confirm RED**

Run: `pnpm vitest run src/contexts/discovery/application/discovery-runs/start/start-discovery-run.test.ts src/contexts/discovery/application/discovery-runs/start/plan-discovery-run-work.test.ts`

Expected: the optional-provider types, work planner, and `not-runnable` result do not exist.

- [ ] **Step 3: Implement the work planner and starter guard**

Use `DiscoverySetupReader`, `planSearchLanes`, and a catalog count of enabled boards. Count web requests only when `providerName` is non-null. Reserve and schedule only when either count is greater than zero.

- [ ] **Step 4: Write failing HTTP tests for provider-free admission and empty-work guidance**

```ts
it("starts known-board discovery when the selected provider has no credential", async () => {
  const response = await post(discoveryRequest({ profileId: 7, provider: "serper" }));
  expect(startDiscoveryRun).toHaveBeenCalledWith({ profileId: 7, providerName: null });
  expect(response.status).toBe(202);
});

it("explains an empty schedule without creating a run", async () => {
  expect(await response.json()).toEqual({
    ok: false,
    message: "Enable a company board or configure a web search provider before running discovery.",
  });
});
```

- [ ] **Step 5: Implement request normalization**

Reject unknown provider names. Treat a known provider without a credential as unavailable for this run. Call `assertProviderReady` only for a configured provider. Translate `not-runnable` into the recovery message without a run ID.

- [ ] **Step 6: Run the affected non-watch tests**

Run: `pnpm vitest run src/contexts/discovery/application/discovery-runs/start/start-discovery-run.test.ts src/contexts/discovery/application/discovery-runs/start/plan-discovery-run-work.test.ts src/contexts/discovery/presentation/web/http/start-discovery-run.test.ts`

Expected: all selected tests pass.

### Task 2: Persist phase and lane evidence

**Files:**

- Modify: `src/contexts/discovery/infrastructure/sqlite/schema.ts`
- Create: `drizzle/0006_*.sql` and its generated metadata through `pnpm drizzle-kit generate`
- Modify: `src/contexts/discovery/application/discovery-runs/ports/discovery-run-journal.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/discovery-run-journal.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/discovery-run-journal.test.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/discovery-run-registry.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/discovery-run-registry.test.ts`

**Interfaces:**

- `DiscoveryRunPhase` is `"known-boards" | "web-coverage" | "matching"`.
- `WebCoverageStatus` is `"pending" | "running" | "completed" | "skipped" | "failed"`.
- Persist `phase`, `known_board_count`, `known_board_success_count`, and `web_coverage_status` on `discovery_runs`.
- `DiscoveryRunJournal.recordPhase(runId, phase, recordedAt)` updates phase and heartbeat.
- `DiscoveryRunJournal.recordLaneEvidence(...)` writes board counts and web status with current progress.

- [ ] **Step 1: Write failing journal tests for phase order, board counts, skipped web, and cancellation guards**

```ts
journal.recordPhase(run.id, "known-boards", now);
journal.recordLaneEvidence(run.id, {
  knownBoardCount: 2,
  knownBoardSuccessCount: 1,
  webCoverageStatus: "skipped",
  progress,
  recordedAt: now,
});

expect(readRun(sqlite, run.id)).toMatchObject({
  phase: "known-boards",
  known_board_count: 2,
  known_board_success_count: 1,
  web_coverage_status: "skipped",
});
```

- [ ] **Step 2: Run the journal and registry tests and confirm RED**

Run: `pnpm vitest run src/contexts/discovery/infrastructure/sqlite/discovery-run-journal.test.ts src/contexts/discovery/infrastructure/sqlite/discovery-run-registry.test.ts`

- [ ] **Step 3: Add schema fields and generate the migration**

Run: `pnpm drizzle-kit generate`

Inspect the SQL and metadata. The migration must add nullable or compatible defaults so existing local databases migrate without data assumptions.

- [ ] **Step 4: Implement journal writes and reset behavior**

Every write must retain the existing `status = running` guard. A late phase or lane write after cancellation must change zero rows.

- [ ] **Step 5: Run migration and focused persistence tests**

Run: `pnpm db:migrate`

Run: `pnpm vitest run src/contexts/discovery/infrastructure/sqlite/discovery-run-journal.test.ts src/contexts/discovery/infrastructure/sqlite/discovery-run-registry.test.ts`

Expected: migration succeeds and the focused tests pass.

### Task 3: Execute known boards before optional web coverage

**Files:**

- Modify: `src/contexts/discovery/application/discovery-runs/ports/job-discovery-catalog.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/sqlite-job-discovery-catalog.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/sync-boards.ts`
- Modify: `src/contexts/discovery/application/discovery-runs/discover/discover-jobs.ts`
- Modify: `src/contexts/discovery/application/discovery-runs/discover/discover-jobs.test.ts`
- Modify: `src/contexts/discovery/application/discovery-runs/execute/execute-discovery-run.ts`
- Modify: `src/contexts/discovery/application/discovery-runs/execute/execute-discovery-run.test.ts`

**Interfaces:**

- `JobDiscoveryCatalog.countEnabledBoards()` returns the admission count.
- `JobDiscoveryCatalog.synchronizeEnabledBoards(jobLimit)` returns per-board `{ boardId, jobsWritten, error }` evidence and does not evaluate profiles.
- `DiscoverySummary` adds known-board counts and `webCoverageStatus`.

- [ ] **Step 1: Characterize current web-first behavior where it still needs preservation**

Add temporary `*.characterisation.test.ts` coverage only for branches without equivalent permanent tests: discovered-board deduplication, continuation after one board sync error, and one final profile evaluation. Mark the file as temporary.

- [ ] **Step 2: Write failing behavior tests for phase order and board-only execution**

```ts
expect(events).toEqual([
  "phase:known-boards",
  "sync:board-11",
  "phase:web-coverage",
  "search:serper",
  "phase:matching",
  "evaluate:profile-7",
]);

expect(boardOnlySummary).toMatchObject({
  knownBoards: 1,
  knownBoardSuccesses: 1,
  webCoverageStatus: "skipped",
  matches: 2,
});
```

- [ ] **Step 3: Run the discovery tests and confirm RED**

Run: `pnpm vitest run src/contexts/discovery/application/discovery-runs/discover/discover-jobs.test.ts src/contexts/discovery/application/discovery-runs/execute/execute-discovery-run.test.ts`

- [ ] **Step 4: Implement the minimum orchestration change**

Prepare the reserved run, record `known-boards`, sync all enabled boards sequentially, and retain every successful write. If a provider is present, record `web-coverage` and run the current lane loop. Keep search-only sources and unknown-company discovery unchanged. Do not sync a known board twice if web results rediscover it. Record `matching` and evaluate once after both lanes.

- [ ] **Step 5: Make outcome handling use aggregate success**

A board success plus failed web coverage returns `partial`. All scheduled failures return `failed`. No-provider admission records web `skipped`; successful boards return `completed`. Cancellation wins at every phase boundary and keeps successful writes.

- [ ] **Step 6: Replace temporary characterization coverage**

Move intended behavior into permanent tests and remove the temporary characterisation file once the same branches are protected.

- [ ] **Step 7: Run application and adapter tests**

Run: `pnpm vitest run src/contexts/discovery/application/discovery-runs/discover/discover-jobs.test.ts src/contexts/discovery/application/discovery-runs/execute/execute-discovery-run.test.ts src/contexts/discovery/infrastructure/sqlite/discovery-workflow.integration.test.ts`

Expected: phase order, board-only, mixed success, all-failed, cancellation, and existing web coverage pass.

### Task 4: One canonical run outcome for all readers

**Files:**

- Create: `src/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome.ts`
- Create: `src/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome.test.ts`
- Modify: `src/contexts/discovery/application/discovery-runs/status/result.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/sqlite-discovery-run-status-reader.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/sqlite-discovery-run-status-reader.test.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/read-models/runs.ts`
- Modify: `src/contexts/discovery/infrastructure/sqlite/read-models/runs.test.ts`

**Interfaces:**

- `DiscoveryRunOutcome` is `"running" | "completed" | "partial" | "failed" | "cancelled"`.
- `deriveDiscoveryRunOutcome(evidence)` is the only function that combines persisted run status, board successes, query successes, and error counts.
- Status, history, and detail DTOs include `outcome`, `phase`, and `webCoverageStatus`.

- [ ] **Step 1: Write the pure outcome truth table and confirm RED**

```ts
it.each([
  [{ status: "running" }, "running"],
  [{ status: "cancelled" }, "cancelled"],
  [{ status: "completed", knownBoardSuccessCount: 1, errorCount: 0 }, "completed"],
  [{ status: "completed", knownBoardSuccessCount: 1, errorCount: 1 }, "partial"],
  [{ status: "failed", successCount: 0, errorCount: 2 }, "failed"],
])("derives %s", (evidence, expected) => {
  expect(deriveDiscoveryRunOutcome(completeEvidence(evidence))).toBe(expected);
});
```

- [ ] **Step 2: Implement the pure mapper with legacy-row fallback**

Legacy rows lack the new lane fields. For them, preserve the existing status plus query and sync error behavior. New rows use explicit board and web evidence.

- [ ] **Step 3: Write failing reader tests proving identical outcomes**

Seed one partial run and assert the status endpoint, run history, and run detail all return `outcome: "partial"`.

- [ ] **Step 4: Route every reader through the canonical function**

Do not retain nested status and error-count conditions in individual readers.

- [ ] **Step 5: Run focused outcome and read-model tests**

Run: `pnpm vitest run src/contexts/discovery/application/discovery-runs/outcome/derive-discovery-run-outcome.test.ts src/contexts/discovery/infrastructure/sqlite/sqlite-discovery-run-status-reader.test.ts src/contexts/discovery/infrastructure/sqlite/read-models/runs.test.ts`

Expected: the pure truth table and all three reader contracts pass.

### Task 5: Update the Jobs, notification, history, detail, and Sources surfaces

**Files:**

- Modify: `src/contexts/discovery/composition/web/routes/jobs.tsx`
- Modify: `src/contexts/discovery/presentation/web/components/run-controls.tsx`
- Modify: `src/contexts/discovery/presentation/web/components/discovery-notifications.tsx`
- Modify: `src/contexts/discovery/presentation/web/components/discovery-notifications.test.ts`
- Create: `src/contexts/discovery/presentation/web/run-outcome-presentation.ts`
- Create: `src/contexts/discovery/presentation/web/run-outcome-presentation.test.ts`
- Modify: `src/contexts/discovery/composition/web/routes/runs.tsx`
- Modify: `src/contexts/discovery/composition/web/routes/run-detail.tsx`
- Modify: `src/contexts/discovery/composition/web/routes/sources.tsx`
- Modify: `src/contexts/discovery/presentation/web/styles.css`

**Interfaces:**

- `presentDiscoveryRunOutcome(outcome)` returns the shared label, notice title, and semantic severity.
- `RunControls` receives `activeBoardCount` and provider configuration state.

- [ ] **Step 1: Write failing presentation tests**

Assert `Partial`, `Completed`, `Failed`, and `Cancelled` use the same labels in the shared mapper. Assert a running `known-boards` phase says `Refreshing known boards`; `web-coverage` says `Expanding web coverage`; and a skipped web lane appears in the completion message.

- [ ] **Step 2: Remove the duplicate Jobs-page refresh action**

Keep one primary `Run discovery` button. It is enabled when `activeBoardCount > 0` or a provider is configured. If both are absent, disable it and render a link to `/sources` with the agreed recovery guidance.

- [ ] **Step 3: Use canonical outcome and phase data in every surface**

Notifications, history rows, and detail headings consume `outcome`. They must not combine raw status and error counts independently. Keep the cancel action keyboard-accessible and retain `aria-live="polite"` for phase changes.

- [ ] **Step 4: Change Sources copy to maintenance language**

The page header and manual action should describe refreshing the board registry for maintenance and recovery, not as a second discovery workflow.

- [ ] **Step 5: Run focused component and route tests**

Run: `pnpm vitest run src/contexts/discovery/presentation/web/components/discovery-notifications.test.ts src/contexts/discovery/presentation/web/run-outcome-presentation.test.ts src/contexts/discovery/presentation/web/resolve-job-selection.test.ts`

Expected: shared labels, phase wording, skipped-web summary, and provider-free selection pass.

### Task 6: Browser acceptance, mutation evidence, and final gates

**Files:**

- Modify: `e2e/discovery-journey.spec.ts`
- Modify only when behavior requires it: focused tests from Tasks 1 through 5

- [ ] **Step 1: Add Playwright coverage for the walking skeleton**

Cover board-first phase order, board-only completion with skipped web, no-board web-only continuation, mixed board and web failure resulting in `Partial`, identical partial labels in history and detail, and the disabled empty schedule. Use role and accessible-name locators.

- [ ] **Step 2: Run the focused browser journey**

Run: `PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm test:e2e -- e2e/discovery-journey.spec.ts`

Expected: the ADM-153 journeys pass at the configured desktop and mobile projects.

- [ ] **Step 3: Run focused mutation testing at the end-of-phase gate**

Read the mutation-testing skill and select the changed application decision files in `stryker.focused.config.mjs`. Run `pnpm test:mutation:focused`. Kill valuable survivors with behavior tests, then rerun the same focused command.

- [ ] **Step 4: Run all repository gates on the final tree**

Run:

```bash
pnpm lint
pnpm typecheck
pnpm test
PLAYWRIGHT_USE_SYSTEM_CHROME=1 pnpm test:e2e
pnpm build
git diff --check
```

Expected: every command exits zero.

- [ ] **Step 5: Run the required read-only Claude Opus review**

Record `git rev-parse HEAD` and `git status --short` before and after. Freeze ADM-153, this plan, `AGENTS.md`, the target branch, and the fresh verification results in the commission. Run the exact `claude -p` command from `AGENTS.md`. The reviewer may run at most two focused, non-repeated test commands.

- [ ] **Step 6: Reproduce load-bearing findings and finish locally**

Fix accepted findings test-first, rerun invalidated checks, and repeat the read-only review if code changed. Leave the completed task branch uncommitted unless the user authorizes a commit. Do not push.
