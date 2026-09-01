export const DISCOVERY_RUN_START_EVENT = "job-radar:discovery-run-start";

export type DiscoveryRunStartEventDetail =
  | {
      readonly state: "starting";
      readonly requestId: string;
      readonly profileId: number;
      readonly profileName: string;
    }
  | {
      readonly state: "accepted";
      readonly requestId: string;
      readonly runId: number;
    }
  | {
      readonly state: "rejected";
      readonly requestId: string;
    };

export function dispatchDiscoveryRunStart(detail: DiscoveryRunStartEventDetail): void {
  window.dispatchEvent(new CustomEvent(DISCOVERY_RUN_START_EVENT, { detail }));
}
