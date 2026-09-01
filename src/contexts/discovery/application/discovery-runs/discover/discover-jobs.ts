import { decideSearchLaneContinuation } from "@/contexts/discovery/application/discovery-runs/planning/decide-search-lane-continuation";
import { planSearchLanes } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import type { DiscoveryRunExecution } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";
import type {
  DiscoveryRunJournal,
  DiscoveryRunProgress,
} from "@/contexts/discovery/application/discovery-runs/ports/discovery-run-journal";
import type { DiscoverySetupReader } from "@/contexts/discovery/application/discovery-runs/ports/discovery-setup";
import type { JobDiscoveryCatalog } from "@/contexts/discovery/application/discovery-runs/ports/job-discovery-catalog";
import type { JobMatchEvaluator } from "@/contexts/discovery/application/discovery-runs/ports/job-match-evaluator";
import type { KnownBoardDiscoveryCatalog } from "@/contexts/discovery/application/discovery-runs/ports/known-board-discovery";
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
  readonly knownBoards: number;
  readonly knownBoardSuccesses: number;
  readonly jobs: number;
  readonly matches: number;
  readonly queryErrors: number;
  readonly syncErrors: number;
  readonly webCoverageStatus: "completed" | "skipped" | "failed";
  readonly budgetStopReason?: "max-requests-per-run";
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
  readonly knownBoards: KnownBoardDiscoveryCatalog;
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
  knownBoards,
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
      const searchMaxAgeDays =
        policy.searchFreshnessDays > 0
          ? Math.min(profile.maxAgeDays, policy.searchFreshnessDays)
          : profile.maxAgeDays;
      const plannedLanes = command.providerName
        ? planSearchLanes(
            {
              titleTerms: profile.titleTerms,
              markets: profile.markets,
              includeRemote: profile.includeRemote,
            },
            sources,
            policy.strategies,
            policy.worldwideRemoteTerms,
          )
        : [];
      throwIfCancelled(command.signal);
      const run = runs.prepare({
        ...(command.runId === undefined ? {} : { runId: command.runId }),
        profileId: command.profileId,
        providerName: command.providerName,
        startedAt: now(),
      });
      const boardIds = new Set<number>();
      const knownBoardIds = new Set<number>();
      const queryErrors: string[] = [];
      const runErrors: string[] = [];
      let hitCount = 0;
      let jobsWritten = 0;
      let matchesFound = 0;
      let syncErrors = 0;
      let knownBoardCount = 0;
      let knownBoardCompletedCount = 0;
      let knownBoardSuccesses = 0;
      let activeBoardName: string | null = null;
      let querySucceeded = false;
      let activeQueryId: number | undefined;
      let admittedQueryCount = 0;
      let providerFailure: DiscoverySummary["providerFailure"];
      let budgetStopReason: DiscoverySummary["budgetStopReason"];
      let webCoverageStatus: DiscoverySummary["webCoverageStatus"] = command.providerName
        ? "completed"
        : "skipped";

      const progress = (): DiscoveryRunProgress => ({
        hitCount,
        jobsUpserted: jobsWritten,
        queryErrorCount: queryErrors.length,
        syncErrorCount: syncErrors,
      });
      const recordBoardProgress = () =>
        runs.recordBoardProgress(run.id, {
          totalBoardCount: knownBoardCount,
          completedBoardCount: knownBoardCompletedCount,
          successfulBoardCount: knownBoardSuccesses,
          activeBoardName,
          jobsUpserted: jobsWritten,
          matchesFound,
          syncErrorCount: syncErrors,
          recordedAt: now(),
        });
      const evaluateMatches = async () =>
        matches.evaluate(
          command.profileId,
          {
            marketScopes: profile.markets.map((market) => market.scope),
            excludedMarketScopes: profile.excludedMarkets.map((market) => market.scope),
          },
          () => {
            runs.recordProgress(run.id, progress(), now());
          },
          () => throwIfCancelled(command.signal),
        );

      try {
        const refreshKnownBoards =
          command.syncBoards !== false && policy.companyBoardRefreshEnabled;
        if (refreshKnownBoards) {
          runs.recordPhase(run.id, "known-boards", now());
          knownBoardCount = knownBoards.countEnabledBoards();
          recordBoardProgress();
          await knownBoards.synchronizeEnabledBoards(
            command.boardJobLimit ?? policy.boardJobLimit,
            {
              boardStarted(board) {
                throwIfCancelled(command.signal);
                activeBoardName = board.name;
                recordBoardProgress();
              },
              async boardCompleted(result) {
                throwIfCancelled(command.signal);
                knownBoardIds.add(result.boardId);
                jobsWritten += result.jobsWritten;
                if (result.error) {
                  syncErrors += 1;
                  runErrors.push(`Known board ${result.boardId}: ${result.error}`);
                } else {
                  knownBoardSuccesses += 1;
                }
                knownBoardCompletedCount += 1;
                activeBoardName =
                  knownBoardCompletedCount === knownBoardCount ? null : activeBoardName;
                recordBoardProgress();
              },
            },
          );
        }
        runs.recordLaneEvidence(run.id, {
          knownBoardCount,
          knownBoardSuccessCount: knownBoardSuccesses,
          webCoverageStatus: command.providerName ? "pending" : "skipped",
          progress: progress(),
          recordedAt: now(),
        });

        if (command.providerName) {
          runs.recordPhase(run.id, "web-coverage", now());
          runs.recordLaneEvidence(run.id, {
            knownBoardCount,
            knownBoardSuccessCount: knownBoardSuccesses,
            webCoverageStatus: "running",
            progress: progress(),
            recordedAt: now(),
          });
          const provider = providers.get(command.providerName);
          laneLoop: for (const [queryIndex, lane] of plannedLanes.entries()) {
            if (admittedQueryCount >= policy.maxRequestsPerRun) {
              budgetStopReason = "max-requests-per-run";
              break;
            }
            for (let pageNumber = 1; ; pageNumber += 1) {
              throwIfCancelled(command.signal);
              const prepared = provider.prepare(lane, {
                count: command.resultsPerQuery ?? policy.resultsPerQuery,
                maxAgeDays: searchMaxAgeDays,
                page: pageNumber,
              });
              const query = runs.admitRequest(run.id, {
                atsType: lane.source.atsType,
                sourcePattern: lane.source.pattern,
                titleTerm: lane.titleTerms.join(", "),
                text: prepared.renderedQuery,
                marketKey: lane.market.scope.key,
                countryCode: lane.market.countryCode,
                searchLanguage: lane.market.searchLanguage,
                laneKind: lane.kind,
                strategy: lane.strategy,
                page: pageNumber,
              });
              admittedQueryCount += 1;
              activeQueryId = query.id;
              runs.startQuery(query.id, now());
              let results: Awaited<ReturnType<typeof prepared.execute>>["results"] = [];
              let hasMore = false;
              let queryFailed = false;
              try {
                throwIfCancelled(command.signal);
                const page = await prepared.execute(command.signal);
                results = page.results;
                hasMore = page.hasMore;
              } catch (error) {
                if (command.signal?.aborted) {
                  throw error;
                }
                if (error instanceof SearchProviderFailure) {
                  const skippedQueries = plannedLanes.length - queryIndex - 1;
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
                  break laneLoop;
                }
                const message = errorMessage(error);
                queryErrors.push(
                  `${query.sourcePattern} / ${query.titleTerm || query.laneKind}: ${message}`,
                );
                queryFailed = true;
                runs.failQuery(query.id, message, now());
              }

              let usefulHitCount = 0;
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
                usefulHitCount += Number(recorded.isUseful);
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
              if (queryFailed) {
                activeQueryId = undefined;
                runs.recordProgress(run.id, progress(), now());
                break;
              }

              const continuation = decideSearchLaneContinuation({
                hasMore,
                usefulHitCount,
                minimumUsefulHitsPerPage: policy.minimumUsefulHitsPerPage,
                page: pageNumber,
                maxPagesPerLane: policy.maxPagesPerLane,
                admittedRequestCount: admittedQueryCount,
                maxRequestsPerRun: policy.maxRequestsPerRun,
              });
              runs.completeQuery(query.id, {
                hitCount: results.length,
                usefulHitCount,
                hasMore,
                stopReason: continuation.stopReason,
                finishedAt: now(),
              });
              querySucceeded = true;
              activeQueryId = undefined;
              runs.recordProgress(run.id, progress(), now());
              if (!continuation.continue) {
                if (continuation.stopReason === "max-requests-per-run") {
                  budgetStopReason = continuation.stopReason;
                  break laneLoop;
                }
                break;
              }
            }
          }

          webCoverageStatus =
            providerFailure ||
            (plannedLanes.length > 0 && !querySucceeded && queryErrors.length > 0)
              ? "failed"
              : "completed";
          runs.recordLaneEvidence(run.id, {
            knownBoardCount,
            knownBoardSuccessCount: knownBoardSuccesses,
            webCoverageStatus,
            progress: progress(),
            recordedAt: now(),
          });
        }

        if (command.syncBoards !== false) {
          for (const boardId of boardIds) {
            if (knownBoardIds.has(boardId)) {
              continue;
            }
            throwIfCancelled(command.signal);
            const result = await jobs.synchronizeBoard(
              boardId,
              command.boardJobLimit ?? policy.boardJobLimit,
            );
            jobsWritten += result.jobsWritten;
            syncErrors += Number(Boolean(result.error));
            if (result.error) {
              runErrors.push(`Discovered board ${boardId}: ${result.error}`);
            }
            runs.recordProgress(run.id, progress(), now());
          }
        }

        throwIfCancelled(command.signal);
        runs.recordPhase(run.id, "matching", now());
        matchesFound = (await evaluateMatches()).matched;
        runs.complete({
          runId: run.id,
          progress: progress(),
          boardsDiscovered: boardIds.size,
          matchesFound,
          errors: [...runErrors, ...queryErrors],
          allWorkFailed:
            knownBoardSuccesses === 0 &&
            (knownBoardCount > 0 || plannedLanes.length > 0) &&
            !querySucceeded,
          budgetStopReason: budgetStopReason ?? null,
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
        knownBoards: knownBoardCount,
        knownBoardSuccesses,
        jobs: jobsWritten,
        matches: matchesFound,
        queryErrors: queryErrors.length,
        syncErrors,
        webCoverageStatus,
        ...(budgetStopReason ? { budgetStopReason } : {}),
        ...(providerFailure ? { providerFailure } : {}),
      };
    },
  };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
