import { APPLICATION_STAGES, type ApplicationStage } from "./application-stage";

export type StageChangeResult =
  | {
      readonly accepted: true;
      readonly entryKind: "stage-changed" | "stage-corrected";
      readonly stage: ApplicationStage;
    }
  | {
      readonly accepted: false;
      readonly reason: "invalid-stage-transition" | "stage-unchanged";
    };

export function changeApplicationStage(
  current: ApplicationStage,
  requested: ApplicationStage,
  intent: "advance" | "correction",
): StageChangeResult {
  if (current === requested) return { accepted: false, reason: "stage-unchanged" };
  if (intent === "correction") {
    return { accepted: true, entryKind: "stage-corrected", stage: requested };
  }

  const currentPosition = APPLICATION_STAGES.indexOf(current);
  if (APPLICATION_STAGES[currentPosition + 1] !== requested) {
    return { accepted: false, reason: "invalid-stage-transition" };
  }
  return { accepted: true, entryKind: "stage-changed", stage: requested };
}
