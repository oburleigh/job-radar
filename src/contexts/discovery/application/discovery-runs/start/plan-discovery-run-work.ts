import { planSearchLanes } from "@/contexts/discovery/application/discovery-runs/planning/plan-search-lanes";
import type { StartDiscoveryRunCommand } from "@/contexts/discovery/application/discovery-runs/ports/discovery-run";
import type { DiscoverySetupReader } from "@/contexts/discovery/application/discovery-runs/ports/discovery-setup";
import type { KnownBoardDiscoveryCatalog } from "@/contexts/discovery/application/discovery-runs/ports/known-board-discovery";

export type DiscoveryBoardInventory = Pick<KnownBoardDiscoveryCatalog, "countEnabledBoards">;

export type DiscoveryRunWorkPlan = {
  readonly knownBoardCount: number;
  readonly webRequestCount: number;
};

export interface ForPlanningDiscoveryRunWork {
  readonly plan: (command: StartDiscoveryRunCommand) => DiscoveryRunWorkPlan;
}

export function createDiscoveryRunWorkPlanner({
  setup,
  boards,
}: {
  readonly setup: DiscoverySetupReader;
  readonly boards: DiscoveryBoardInventory;
}): ForPlanningDiscoveryRunWork {
  return {
    plan(command) {
      const discovery = setup.load(command);
      const webRequestCount = command.providerName
        ? planSearchLanes(
            {
              titleTerms: discovery.profile.titleTerms,
              markets: discovery.profile.markets,
              includeRemote: discovery.profile.includeRemote,
            },
            discovery.sources,
            discovery.policy.strategies,
            discovery.policy.worldwideRemoteTerms,
          ).length
        : 0;
      return {
        knownBoardCount: discovery.policy.companyBoardRefreshEnabled
          ? boards.countEnabledBoards()
          : 0,
        webRequestCount,
      };
    },
  };
}
