import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import {
  findRankedOpportunity,
  getOpportunitySnapshot,
  listRankedOpportunities,
} from "@/contexts/discovery/infrastructure/sqlite/read-models/opportunities";

export const discoveryOpportunityContract = {
  listRankedOpportunities: () => listRankedOpportunities(db),
  findRankedOpportunity: (reference: Parameters<typeof findRankedOpportunity>[1]) =>
    findRankedOpportunity(db, reference),
  getOpportunitySnapshot: (reference: Parameters<typeof getOpportunitySnapshot>[1]) =>
    getOpportunitySnapshot(db, reference),
};
