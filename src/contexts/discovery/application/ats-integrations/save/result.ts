export type SaveAtsIntegrationResult =
  | {
      readonly status: "saved";
      readonly atsType: string;
      readonly label: string;
      readonly created: boolean;
    }
  | {
      readonly status: "rejected";
      readonly reason:
        | "custom-sync-not-supported"
        | "already-exists"
        | "not-found"
        | "missing-host-rule";
    }
  | {
      readonly status: "rejected";
      readonly reason: "pattern-conflict";
      readonly pattern: string;
      readonly owner: string;
    };
