import {
  planBoardDiscoveryQueries,
  planSearchQueries,
} from "@/contexts/discovery/application/discovery-runs/planning/plan-search-queries";
import type { DiscoveryRunExecution } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";
import type {
  DiscoveryRunJournal,
  DiscoveryRunProgress,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";
import type { DiscoverySetupReader } from "@/contexts/discovery/application/discovery-runs/ports/discovery-setup";
import type { JobDiscoveryCatalog } from "@/contexts/discovery/application/discovery-runs/ports/job-discovery-catalog";
import type { JobMatchEvaluator } from "@/contexts/discovery/application/discovery-runs/ports/job-match-evaluator";
import { SearchProviderFailure } from "@/contexts/discovery/application/discovery-runs/ports/search-provider";
import type { SearchProviderDirectory } from "@/contexts/discovery/application/discovery-runs/ports/search-provider-directory";

export type DiscoverJobsCommand = Omit<DiscoveryRunExecution, "runId"> & {
  readonly runId?: number;
  readonly source?: string;
  readonly resultsPerQuery?: number;
  readonly syncBoards?: boolean;
  readonly boardJobLimit?: number;
};

export type DiscoverySummary = {
  readonly runId: number;
  readonly queries: number;
  readonly hits: number;
  readonly boards: number;
  readonly jobs: number;
  readonly matches: number;
  readonly queryErrors: number;
  readonly syncErrors: number;
  readonly providerFailure?: {
    readonly provider: string;
    readonly classification: "fatal" | "transient";
    readonly code: string;
    readonly attempts: number;
    readonly skippedQueries: number;
  };
};

export interface ForDiscoveringJobs {
  readonly discoverJobs: (command: DiscoverJobsCommand) => Promise<DiscoverySummary>;
}

type JobDiscoveryDependencies = {
  readonly setup: DiscoverySetupReader;
  readonly runs: DiscoveryRunJournal;
  readonly jobs: JobDiscoveryCatalog;
  readonly matches: JobMatchEvaluator;
  readonly providers: SearchProviderDirectory;
  readonly now: () => Date;
  readonly yieldControl: () => Promise<void>;
};

function throwIfCancelled(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException("The discovery run was cancelled", "AbortError");
  }
}

export function createJobDiscovery({
  setup,
  runs,
  jobs,
  matches,
  providers,
  now,
  yieldControl,
}: JobDiscoveryDependencies): ForDiscoveringJobs {
  return {
    async discoverJobs(command) {
      throwIfCancelled(command.signal);
      const { profile, sources, policy } = setup.load(command);
      const provider = providers.get(command.providerName);
      const searchMaxAgeDays =
        policy.searchFreshnessDays > 0
          ? Math.min(profile.maxAgeDays, policy.searchFreshnessDays)
          : profile.maxAgeDays;
      const roleQueries = planSearchQueries(
        {
          titleTerms: profile.titleTerms,
          markets: profile.markets.map((market) => market.scope),
          includeRemote: profile.includeRemote,
        },
        sources,
        policy.titleSearchMode,
        policy.worldwideRemoteTerms,
      );
      const boardQueries = planBoardDiscoveryQueries(
        { markets: profile.markets.map((market) => market.scope) },
        sources.filter((source) => source.supportsBoardSync),
      );
      const plannedQueries = [...roleQueries, ...boardQueries];
      throwIfCancelled(command.signal);
      const run = runs.prepare({
        ...(command.runId === undefined ? {} : { runId: command.runId }),
        profileId: command.profileId,
        providerName: provider.name,
        startedAt: now(),
      });
      const boardIds = new Set<number>();
      const queryErrors: string[] = [];
      let hitCount = 0;
      let jobsWritten = 0;
      let matchesFound = 0;
      let syncErrors = 0;
      let querySucceeded = false;
      let activeQueryId: number | undefined;
      let admittedQueryCount = 0;
      let providerFailure: DiscoverySummary["providerFailure"];

      const progress = (): DiscoveryRunProgress => ({
        hitCount,
        jobsUpserted: jobsWritten,
        queryErrorCount: queryErrors.length,
        syncErrorCount: syncErrors,
      });

      try {
        for (const [queryIndex, plannedQuery] of plannedQueries.entries()) {
          throwIfCancelled(command.signal);
          const prepared = provider.prepare(plannedQuery.text, {
            count: command.resultsPerQuery ?? policy.resultsPerQuery,
            maxAgeDays: searchMaxAgeDays,
          });
          const query = runs.admitRequest(run.id, { ...plannedQuery, text: prepared.query });
          admittedQueryCount += 1;
          activeQueryId = query.id;
          runs.startQuery(query.id, now());
          let results: Awaited<ReturnType<typeof prepared.execute>> = [];
          let queryFailed = false;
          try {
            throwIfCancelled(command.signal);
            results = await prepared.execute(command.signal);
          } catch (error) {
            if (command.signal?.aborted) {
              throw error;
            }
            if (error instanceof SearchProviderFailure) {
              const skippedQueries = plannedQueries.length - queryIndex - 1;
              const failureSummary = `${error.provider} ${error.classification} ${error.code} after ${error.attempts} ${error.attempts === 1 ? "attempt" : "attempts"}; skipped ${skippedQueries} ${skippedQueries === 1 ? "query" : "queries"}`;
              queryErrors.push(failureSummary);
              runs.failQuery(query.id, error.message, now());
              providerFailure = {
                provider: error.provider,
                classification: error.classification,
                code: error.code,
                attempts: error.attempts,
                skippedQueries,
              };
              activeQueryId = undefined;
              runs.recordProgress(run.id, progress(), now());
              runs.cancelPendingRequests(
                run.id,
                `Skipped because ${error.provider} reported ${error.code}.`,
                now(),
              );
              break;
            }
            const message = errorMessage(error);
            queryErrors.push(`${query.sourcePattern} / ${query.titleTerm}: ${message}`);
            queryFailed = true;
            runs.failQuery(query.id, message, now());
          }

          for (const [index, result] of results.entries()) {
            throwIfCancelled(command.signal);
            const recorded = await jobs.recordHit({
              runId: run.id,
              query: query.text,
              rank: index + 1,
              result,
              marketScopes: profile.markets.map((market) => market.scope),
              recordedAt: now(),
            });
            hitCount += Number(recorded.inserted);
            jobsWritten += recorded.jobsWritten;
            if (recorded.syncableBoardId !== undefined) {
              boardIds.add(recorded.syncableBoardId);
            }
            if ((index + 1) % policy.workYieldBatchSize === 0) {
              await yieldControl();
              throwIfCancelled(command.signal);
            }
          }
          throwIfCancelled(command.signal);
          if (!queryFailed) {
            runs.completeQuery(query.id, results.length, now());
            querySucceeded = true;
          }
          activeQueryId = undefined;
          runs.recordProgress(run.id, progress(), now());
        }

        if (command.syncBoards !== false) {
          for (const boardId of boardIds) {
            throwIfCancelled(command.signal);
            const result = await jobs.synchronizeBoard(
              boardId,
              command.boardJobLimit ?? policy.boardJobLimit,
            );
            jobsWritten += result.jobsWritten;
            syncErrors += Number(Boolean(result.error));
            runs.recordProgress(run.id, progress(), now());
          }
        }

        throwIfCancelled(command.signal);
        matchesFound = (
          await matches.evaluate(
            command.profileId,
            {
              marketScopes: profile.markets.map((market) => market.scope),
              excludedMarketScopes: profile.excludedMarkets.map((market) => market.scope),
            },
            () => {
              runs.recordProgress(run.id, progress(), now());
            },
            () => throwIfCancelled(command.signal),
          )
        ).matched;
        runs.complete({
          runId: run.id,
          progress: progress(),
          boardsDiscovered: boardIds.size,
          matchesFound,
          errors: queryErrors,
          allQueriesFailed: plannedQueries.length > 0 && !querySucceeded,
          finishedAt: now(),
        });
      } catch (error) {
        if (command.signal?.aborted) {
          throw error;
        }
        const message = errorMessage(error);
        if (activeQueryId !== undefined) {
          runs.failQuery(activeQueryId, message, now());
        }
        runs.cancelPendingRequests(
          run.id,
          `Skipped because the discovery run failed: ${message}`,
          now(),
        );
        runs.fail({
          runId: run.id,
          progress: progress(),
          boardsDiscovered: boardIds.size,
          matchesFound,
          message,
          finishedAt: now(),
        });
        throw error;
      }

      return {
        runId: run.id,
        queries: admittedQueryCount,
        hits: hitCount,
        boards: boardIds.size,
        jobs: jobsWritten,
        matches: matchesFound,
        queryErrors: queryErrors.length,
        syncErrors,
        ...(providerFailure ? { providerFailure } : {}),
      };
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
