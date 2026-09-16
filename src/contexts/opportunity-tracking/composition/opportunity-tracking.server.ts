import { discoveryOpportunityContract } from "@/contexts/discovery/public-contract.server";
import { createOpportunityWorkflow } from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import { opportunityTrackingDatabase } from "@/contexts/opportunity-tracking/infrastructure/sqlite/database";
import { createSqliteOpportunityStore } from "@/contexts/opportunity-tracking/infrastructure/sqlite/sqlite-opportunity-store";

export const opportunityTracking = createOpportunityWorkflow({
  now: () => new Date(),
  opportunities: {
    findRankedOpportunity(reference) {
      const opportunity = discoveryOpportunityContract.findRankedOpportunity(reference);
      return opportunity
        ? {
            searchProfileId: opportunity.searchProfileId,
            jobListingId: opportunity.jobListingId,
          }
        : null;
    },
  },
  store: createSqliteOpportunityStore(opportunityTrackingDatabase),
});
