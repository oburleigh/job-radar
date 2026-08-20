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
      const { profile, sources, policy } = setup.load(command);
      const provider = providers.get(command.providerName);
      const searchMaxAgeDays =
        policy.searchFreshnessDays > 0
          ? Math.min(profile.maxAgeDays, policy.searchFreshnessDays)
          : profile.maxAgeDays;
      const roleQueries = planSearchQueries(
        profile,
        sources,
        policy.titleSearchMode,
        policy.worldwideRemoteTerms,
      );
      const boardQueries = planBoardDiscoveryQueries(
        profile,
        sources.filter((source) => source.supportsBoardSync),
      );
      const plannedQueries = [...roleQueries, ...boardQueries];
      const run = runs.prepare({
        ...(command.runId === undefined ? {} : { runId: command.runId }),
        profileId: command.profileId,
        providerName: provider.name,
        queryCount: plannedQueries.length,
        startedAt: now(),
      });
      const boardIds = new Set<number>();
      const queryErrors: string[] = [];
      let hitCount = 0;
      let jobsWritten = 0;
      let matchesFound = 0;
      let syncErrors = 0;
      let activeQueryId: number | undefined;

      const progress = (): DiscoveryRunProgress => ({
        hitCount,
        jobsUpserted: jobsWritten,
        queryErrorCount: queryErrors.length,
        syncErrorCount: syncErrors,
      });

      try {
        const queries = runs.planQueries(run.id, plannedQueries);
        for (const query of queries) {
          activeQueryId = query.id;
          runs.startQuery(query.id, now());
          let results = [] as Awaited<ReturnType<typeof provider.search>>;
          let queryFailed = false;
          try {
            results = await provider.search(query.text, {
              count: command.resultsPerQuery ?? policy.resultsPerQuery,
              maxAgeDays: searchMaxAgeDays,
            });
          } catch (error) {
            const message = errorMessage(error);
            queryErrors.push(`${query.sourcePattern} / ${query.titleTerm}: ${message}`);
            queryFailed = true;
            runs.failQuery(query.id, message, now());
          }

          for (const [index, result] of results.entries()) {
            const recorded = await jobs.recordHit({
              runId: run.id,
              query: query.text,
              rank: index + 1,
              result,
              locationTerms: profile.locationTerms,
              recordedAt: now(),
            });
            hitCount += Number(recorded.inserted);
            jobsWritten += recorded.jobsWritten;
            if (recorded.syncableBoardId !== undefined) {
              boardIds.add(recorded.syncableBoardId);
            }
            if ((index + 1) % policy.workYieldBatchSize === 0) {
              await yieldControl();
            }
          }
          if (!queryFailed) {
            runs.completeQuery(query.id, results.length, now());
          }
          activeQueryId = undefined;
          runs.recordProgress(run.id, progress(), now());
        }

        if (command.syncBoards !== false) {
          for (const boardId of boardIds) {
            const result = await jobs.synchronizeBoard(
              boardId,
              command.boardJobLimit ?? policy.boardJobLimit,
            );
            jobsWritten += result.jobsWritten;
            syncErrors += Number(Boolean(result.error));
            runs.recordProgress(run.id, progress(), now());
          }
        }

        matchesFound = (
          await matches.evaluate(command.profileId, () => {
            runs.recordProgress(run.id, progress(), now());
          })
        ).matched;
        runs.complete({
          runId: run.id,
          progress: progress(),
          boardsDiscovered: boardIds.size,
          matchesFound,
          errors: queryErrors,
          allQueriesFailed:
            plannedQueries.length > 0 && queryErrors.length === plannedQueries.length,
          finishedAt: now(),
        });
      } catch (error) {
        const message = errorMessage(error);
        if (activeQueryId !== undefined) {
          runs.failQuery(activeQueryId, message, now());
        }
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
        queries: plannedQueries.length,
        hits: hitCount,
        boards: boardIds.size,
        jobs: jobsWritten,
        matches: matchesFound,
        queryErrors: queryErrors.length,
        syncErrors,
      };
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
