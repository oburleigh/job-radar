import { eq } from "drizzle-orm";

import type { JobMatchEvaluator } from "@/contexts/discovery/application/discovery-runs/ports/job-match-evaluator";

import type { db } from "./database";
import { searchProfiles } from "./schema";
import { evaluateAndStore } from "./store-matches";

type Database = typeof db;

export function createSqliteJobMatchEvaluator(database: Database): JobMatchEvaluator {
  return {
    async evaluate(profileId, onBatch, beforeBatch) {
      const profile = database
        .select()
        .from(searchProfiles)
        .where(eq(searchProfiles.id, profileId))
        .get();
      if (!profile) {
        throw new Error(`Search profile ${profileId} was not found`);
      }
      return evaluateAndStore(profile, {
        onBatch,
        ...(beforeBatch ? { beforeBatch } : {}),
      });
    },
  };
}
