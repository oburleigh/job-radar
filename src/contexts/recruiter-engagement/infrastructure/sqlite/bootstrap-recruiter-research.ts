import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import { recruiterResearchSettings } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

export const defaultRecruiterResearchSettings = {
  directoryMatchWeights: {
    currentActivity: 15,
    evidenceFreshnessAndQuality: 10,
    recruiterRoleAndSeniority: 15,
    specialism: 60,
  },
  defaultBrief: {
    criteria: {
      industries: [],
      specialisms: [],
    },
    description: "",
    firmTarget: 10,
    recruiterTarget: 20,
  },
  execution: {
    model: null,
    reasoningEffort: null,
    stageRequestLimit: 1,
    stageTimeoutMs: 600_000,
  },
} as const satisfies RecruiterResearchSettings;

const legacyDirectoryMatchWeights = {
  contactability: 5,
  currentActivity: 15,
  evidenceFreshnessAndQuality: 10,
  geographicRelevance: 20,
  recruiterRoleAndSeniority: 15,
  specialism: 35,
} as const;

const legacyTechnologyDefaultBrief = {
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
} as const;

const legacyDefaultRecruiterResearchSettings = {
  defaultBrief: legacyTechnologyDefaultBrief,
  execution: {
    ...defaultRecruiterResearchSettings.execution,
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
  },
} as const;

const legacyAccountDefaultRecruiterResearchSettings = {
  defaultBrief: legacyTechnologyDefaultBrief,
  execution: defaultRecruiterResearchSettings.execution,
} as const;

export function bootstrapRecruiterResearch<TSchema extends Record<string, unknown>>(
  database: Database<TSchema>,
  now = new Date(),
): void {
  database
    .insert(recruiterResearchSettings)
    .values({ key: "default", value: defaultRecruiterResearchSettings, updatedAt: now })
    .onConflictDoNothing()
    .run();
  const existing = database
    .select({ value: recruiterResearchSettings.value })
    .from(recruiterResearchSettings)
    .where(eq(recruiterResearchSettings.key, "default"))
    .get()?.value;
  const isLegacyDefault = [
    legacyDefaultRecruiterResearchSettings,
    legacyAccountDefaultRecruiterResearchSettings,
    {
      directoryMatchWeights: legacyDirectoryMatchWeights,
      ...legacyDefaultRecruiterResearchSettings,
    },
    {
      directoryMatchWeights: legacyDirectoryMatchWeights,
      ...legacyAccountDefaultRecruiterResearchSettings,
    },
    {
      directoryMatchWeights: defaultRecruiterResearchSettings.directoryMatchWeights,
      ...legacyDefaultRecruiterResearchSettings,
    },
    {
      directoryMatchWeights: defaultRecruiterResearchSettings.directoryMatchWeights,
      ...legacyAccountDefaultRecruiterResearchSettings,
    },
  ].some((legacy) => JSON.stringify(existing) === JSON.stringify(legacy));
  if (isLegacyDefault) {
    database
      .update(recruiterResearchSettings)
      .set({ value: defaultRecruiterResearchSettings, updatedAt: now })
      .where(eq(recruiterResearchSettings.key, "default"))
      .run();
    return;
  }
  if (!existing || typeof existing !== "object") {
    return;
  }
  if ("directoryMatchWeights" in existing) {
    const weights = existing.directoryMatchWeights;
    if (
      weights &&
      typeof weights === "object" &&
      "specialism" in weights &&
      typeof weights.specialism === "number" &&
      ("geographicRelevance" in weights || "contactability" in weights)
    ) {
      const legacyWeights = weights as Record<string, unknown>;
      const {
        contactability,
        geographicRelevance: _geographicRelevance,
        ...availableWeights
      } = legacyWeights;
      const reclaimedWeight =
        (typeof contactability === "number" ? contactability : 0) +
        (typeof _geographicRelevance === "number" ? _geographicRelevance : 0);
      database
        .update(recruiterResearchSettings)
        .set({
          value: {
            ...existing,
            directoryMatchWeights: {
              ...availableWeights,
              specialism: weights.specialism + reclaimedWeight,
            },
          },
          updatedAt: now,
        })
        .where(eq(recruiterResearchSettings.key, "default"))
        .run();
    }
    return;
  }
  database
    .update(recruiterResearchSettings)
    .set({
      value: {
        ...existing,
        directoryMatchWeights: defaultRecruiterResearchSettings.directoryMatchWeights,
      },
      updatedAt: now,
    })
    .where(eq(recruiterResearchSettings.key, "default"))
    .run();
}
