import { and, desc, eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type { StoredOpportunityAssessment } from "@/contexts/opportunity-tracking/application/advisor-workflow";
import type * as schema from "./schema";
import { opportunityAssessments } from "./schema";

type Database = BetterSQLite3Database<typeof schema>;

export function createSqliteAssessmentStore(database: Database) {
  return {
    save(assessment: StoredOpportunityAssessment): void {
      database.insert(opportunityAssessments).values(assessment).run();
    },
    latest(reference: { readonly searchProfileId: number; readonly jobListingId: number }) {
      const row = database
        .select()
        .from(opportunityAssessments)
        .where(
          and(
            eq(opportunityAssessments.searchProfileId, reference.searchProfileId),
            eq(opportunityAssessments.jobListingId, reference.jobListingId),
          ),
        )
        .orderBy(desc(opportunityAssessments.createdAt), desc(opportunityAssessments.id))
        .get();
      if (!row) return undefined;
      return {
        searchProfileId: row.searchProfileId,
        jobListingId: row.jobListingId,
        summary: row.summary,
        strengths: row.strengths,
        gaps: row.gaps,
        evidence: row.evidence,
        recommendations: row.recommendations,
        model: row.model,
        reasoningEffort: row.reasoningEffort,
        policyVersion: row.policyVersion,
        schemaVersion: row.schemaVersion,
        evidenceCutoff: row.evidenceCutoff,
        createdAt: row.createdAt,
      } satisfies StoredOpportunityAssessment;
    },
  };
}
