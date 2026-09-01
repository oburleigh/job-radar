import { getJobRadarConfig } from "@/contexts/discovery/infrastructure/configuration/job-radar-config";
import { getAtsLabels } from "@/contexts/discovery/infrastructure/job-sources/catalog";
import { db } from "@/contexts/discovery/infrastructure/sqlite/database";
import { companyBoards, sourceDomains } from "@/contexts/discovery/infrastructure/sqlite/schema";

export function getSourcesData() {
  return {
    companyBoardRefreshEnabled: getJobRadarConfig(db).discovery.companyBoardRefreshEnabled,
    sources: sortSourceRegistry(db.select().from(sourceDomains).all(), getAtsLabels()),
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
        lastWarning: companyBoards.lastWarning,
      })
      .from(companyBoards)
      .orderBy(companyBoards.atsType, companyBoards.companyName)
      .all(),
  };
}

export function sortSourceRegistry<
  K extends string,
  T extends { readonly atsType: K; readonly id: number; readonly pattern: string },
>(sources: readonly T[], atsLabels: Readonly<Partial<Record<T["atsType"], string>>>): T[] {
  return sources.toSorted(
    (left, right) =>
      compareSourceValue(
        atsLabels[left.atsType] ?? left.atsType,
        atsLabels[right.atsType] ?? right.atsType,
      ) ||
      compareSourceValue(left.pattern, right.pattern) ||
      left.id - right.id,
  );
}

function compareSourceValue(left: string, right: string): number {
  const normalizedLeft = left.toLowerCase();
  const normalizedRight = right.toLowerCase();
  return normalizedLeft < normalizedRight ? -1 : normalizedLeft > normalizedRight ? 1 : 0;
}
