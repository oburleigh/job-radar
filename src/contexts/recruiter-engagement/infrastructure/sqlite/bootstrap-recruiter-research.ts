import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";

import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import { recruiterResearchSettings } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

export const defaultRecruiterResearchSettings = {
  defaultBrief: {
    criteria: {
      industries: ["Financial services", "Technology", "Healthcare", "Retail and e-commerce"],
      specialisms: [
        "Software engineering",
        "Data and AI",
        "Cloud and DevOps",
        "Cybersecurity",
        "Product",
        "Architecture",
        "Technology leadership",
      ],
    },
    description:
      "Research recruitment firms for software engineering, data and AI, cloud and DevOps, cybersecurity, product, architecture, and technology leadership roles.",
    firmTarget: 10,
    recruiterTarget: 20,
  },
  execution: {
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
    stageRequestLimit: 1,
    stageTimeoutMs: 600_000,
  },
} as const satisfies RecruiterResearchSettings;

export function bootstrapRecruiterResearch<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  now = new Date(),
): void {
  database
    .insert(recruiterResearchSettings)
    .values({ key: "default", value: defaultRecruiterResearchSettings, updatedAt: now })
    .onConflictDoNothing()
    .run();
}
