import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { companyBoards, sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";

export function getSourcesData() {
  return {
    sources: db.select().from(sourceDomains).orderBy(sourceDomains.priority).all(),
    boards: db
      .select({
        id: companyBoards.id,
        atsType: companyBoards.atsType,
        companyName: companyBoards.companyName,
        slug: companyBoards.slug,
        baseUrl: companyBoards.baseUrl,
        enabled: companyBoards.enabled,
        lastSyncedAt: companyBoards.lastSyncedAt,
        lastError: companyBoards.lastError,
      })
      .from(companyBoards)
      .orderBy(companyBoards.atsType, companyBoards.companyName)
      .all(),
  };
}
