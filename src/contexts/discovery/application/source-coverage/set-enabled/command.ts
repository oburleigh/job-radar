export type SetSourceCoverageEnabledCommand =
  | {
      readonly kind: "source" | "board";
      readonly id: number;
      readonly enabled: boolean;
    }
  | {
      readonly kind: "company-boards";
      readonly enabled: boolean;
    };
