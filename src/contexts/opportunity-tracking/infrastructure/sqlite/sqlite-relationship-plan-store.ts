import { desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type { StoredRelationshipPlan } from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import type * as schema from "./schema";
import { applicationRecommendations, relationshipPlans } from "./schema";

type Database = BetterSQLite3Database<typeof schema>;

export function createSqliteRelationshipPlanStore(database: Database) {
  return {
    save(plan: StoredRelationshipPlan): void {
      database.transaction((transaction) => {
        const stored = transaction.insert(relationshipPlans).values(plan).returning().get();
        if (plan.recommendations.length > 0) {
          transaction
            .insert(applicationRecommendations)
            .values(
              plan.recommendations.map((recommendation) => ({
                applicationId: plan.applicationId,
                sourceKind: "relationship-plan" as const,
                sourceRecordId: stored.id,
                title: recommendation.title,
                reason: recommendation.reason,
                evidenceUrls: recommendation.evidenceUrls,
                createdAt: plan.createdAt,
                updatedAt: plan.createdAt,
              })),
            )
            .run();
        }
      });
    },
    latest(applicationId: number): StoredRelationshipPlan | undefined {
      const row = database
        .select()
        .from(relationshipPlans)
        .where(eq(relationshipPlans.applicationId, applicationId))
        .orderBy(desc(relationshipPlans.createdAt), desc(relationshipPlans.id))
        .get();
      if (!row) return undefined;
      return {
        applicationId: row.applicationId,
        summary: row.summary,
        prospectReferences: row.prospectReferences,
        publicPeople: row.publicPeople,
        recommendations: row.recommendations,
        model: row.model,
        reasoningEffort: row.reasoningEffort,
        policyVersion: row.policyVersion,
        schemaVersion: row.schemaVersion,
        evidenceCutoff: row.evidenceCutoff,
        createdAt: row.createdAt,
      };
    },
  };
}
