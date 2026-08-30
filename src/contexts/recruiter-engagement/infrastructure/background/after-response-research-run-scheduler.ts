import type { ForExecutingResearchRuns } from "@/contexts/recruiter-engagement/application/research-runs/execute-research-run";
import type { ResearchRunScheduler } from "@/contexts/recruiter-engagement/application/research-runs/port";

type AfterResponse = (callback: () => Promise<void>) => void;

type AfterResponseResearchRunSchedulerDependencies = {
  readonly afterResponse: AfterResponse;
  readonly execution: ForExecutingResearchRuns;
  readonly reportFailure: (message: string) => void;
};

export function createAfterResponseResearchRunScheduler({
  afterResponse,
  execution,
  reportFailure,
}: AfterResponseResearchRunSchedulerDependencies): ResearchRunScheduler {
  const controllers = new Map<string, AbortController>();
  return {
    schedule(runId) {
      if (controllers.has(runId)) {
        return;
      }
      const controller = new AbortController();
      controllers.set(runId, controller);
      afterResponse(async () => {
        try {
          await execution.executeResearchRun(runId, controller.signal);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          reportFailure(`Research Run ${runId} failed: ${message}`);
        } finally {
          controllers.delete(runId);
        }
      });
    },
    cancel(runId) {
      controllers.get(runId)?.abort(new DOMException("Cancelled by user", "AbortError"));
    },
  };
}
