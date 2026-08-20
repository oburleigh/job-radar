export interface SetSourceCoverageEnabledCommand {
  readonly kind: "source" | "board";
  readonly id: number;
  readonly enabled: boolean;
}
