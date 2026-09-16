export const APPLICATION_STAGES = [
  "preparing",
  "applied",
  "screening",
  "interviewing",
  "offer",
  "closed",
] as const;

export type ApplicationStage = (typeof APPLICATION_STAGES)[number];
