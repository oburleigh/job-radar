import type {
  AdvisorExecutionFinish,
  AdvisorExecutionStart,
} from "@/contexts/opportunity-tracking/application/advisor-history";

export function createRecordingAdvisorHistory() {
  const started: AdvisorExecutionStart[] = [];
  const finished: AdvisorExecutionFinish[] = [];
  return {
    started,
    finished,
    start: (record: AdvisorExecutionStart) => started.push(record),
    finish: (record: AdvisorExecutionFinish) => {
      finished.push(record);
    },
  };
}
