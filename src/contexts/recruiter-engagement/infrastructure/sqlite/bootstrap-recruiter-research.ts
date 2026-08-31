import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import type { RecruiterResearchSettings } from "@/contexts/recruiter-engagement/application/research-settings/settings";
import { recruiterResearchSettings } from "./schema";

type Database<TSchema extends Record<string, unknown>> = BetterSQLite3Database<TSchema>;

export const defaultRecruiterResearchSettings = {
  criteriaOptions: {
    industries: [
      "Technology",
      "Financial services",
      "Healthcare",
      "Life sciences",
      "Energy",
      "Government",
      "Retail and e-commerce",
      "Professional services",
      "Telecommunications",
      "Manufacturing",
      "Logistics and supply chain",
      "Media and entertainment",
      "Education",
      "Real estate and construction",
      "Travel and hospitality",
      "Consumer goods",
    ],
    specialisms: [
      "Software engineering",
      "Data and AI",
      "Cloud and DevOps",
      "Cybersecurity",
      "Product",
      "Design",
      "Architecture",
      "Technology leadership",
      "Project and programme management",
      "Quality engineering",
      "Business analysis",
      "Executive search",
      "Sales and business development",
      "Marketing",
      "Finance",
      "Human resources",
      "Operations",
    ],
  },
  directoryMatchWeights: {
    currentMandatesOrActivity: 15,
    evidenceFreshnessAndQuality: 10,
    namedRecruiterOrTeamEvidence: 10,
    recruiterRoleAndSeniority: 15,
    scaleOrTrackRecord: 10,
    specialism: 20,
    targetMarketOperatingDepth: 20,
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
  publicSearch: {
    currentActivityTerms: ["hiring", "vacancies", "jobs", "recruiting", "recruitment", "mandates"],
    excludedHosts: [
      "agencyspotter.com",
      "bayzat.com",
      "capstone-solutions.com",
      "clutch.co",
      "constructionplacements.com",
      "edarabia.com",
      "ensun.io",
      "experthr.ae",
      "goodfirms.co",
      "headhuntersindubai.com",
      "herohunt.ai",
      "icreativez.com",
      "linkedin.com",
      "naukrigulf.com",
      "nextinhr.com",
      "reddit.com",
      "sortlist.com",
      "teamplusindia.in",
      "techbehemoths.com",
    ],
    firmDiscoveryPhrases: [
      "recruitment agency",
      "recruitment firm",
      "executive search firm",
      "staffing agency",
      "recruiters",
    ],
    maxPagesPerQuery: 2,
    namedRecruiterOrTeamTerms: ["our team", "consultants", "recruiters", "leadership"],
    profileSourceHosts: ["linkedin.com/in"],
    providerName: "serper",
    recruiterRoleTerms: ["recruiter", "talent acquisition", "executive search"],
    resultsPerQuery: 10,
    scaleOrTrackRecordTerms: ["years", "global", "offices", "clients", "placements", "founded"],
    stageRequestLimit: 40,
  },
} as const satisfies RecruiterResearchSettings;

const legacyTechnologyPublicSearchSettings = {
  ...defaultRecruiterResearchSettings.publicSearch,
  currentActivityTerms: ["hiring", "vacancies", "jobs", "recruiting", "mandates"],
  excludedHosts: ["clutch.co", "sortlist.com", "agencyspotter.com", "linkedin.com"],
  firmDiscoveryPhrases: [
    "technology recruitment agency",
    "technology recruitment firm",
    "IT recruitment agency",
    "technology executive search",
  ],
} as const;

const legacyCurrentDirectoryMatchWeights = {
  currentActivity: 15,
  evidenceFreshnessAndQuality: 10,
  recruiterRoleAndSeniority: 15,
  specialism: 60,
} as const;

const legacyExecutionSettings = {
  model: null,
  reasoningEffort: null,
  stageRequestLimit: 1,
  stageTimeoutMs: 600_000,
} as const;

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
    ...legacyExecutionSettings,
    model: "gpt-5.6-terra",
    reasoningEffort: "medium",
  },
} as const;

const legacyAccountDefaultRecruiterResearchSettings = {
  defaultBrief: legacyTechnologyDefaultBrief,
  execution: legacyExecutionSettings,
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
    {
      directoryMatchWeights: legacyCurrentDirectoryMatchWeights,
      defaultBrief: defaultRecruiterResearchSettings.defaultBrief,
      execution: legacyExecutionSettings,
    },
    {
      directoryMatchWeights: legacyCurrentDirectoryMatchWeights,
      ...legacyDefaultRecruiterResearchSettings,
    },
    {
      directoryMatchWeights: legacyCurrentDirectoryMatchWeights,
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
  const migrated = { ...existing } as Record<string, unknown>;
  let changed = false;
  if (!("criteriaOptions" in migrated)) {
    migrated.criteriaOptions = defaultRecruiterResearchSettings.criteriaOptions;
    changed = true;
  }
  if ("directoryMatchWeights" in migrated) {
    const weights = migrated.directoryMatchWeights;
    if (
      weights &&
      typeof weights === "object" &&
      "specialism" in weights &&
      typeof weights.specialism === "number" &&
      ("geographicRelevance" in weights || "contactability" in weights)
    ) {
      const legacyWeights = weights as Record<string, unknown>;
      migrated.directoryMatchWeights = {
        currentMandatesOrActivity: legacyWeights.currentActivity,
        evidenceFreshnessAndQuality: legacyWeights.evidenceFreshnessAndQuality,
        namedRecruiterOrTeamEvidence: legacyWeights.contactability ?? 0,
        recruiterRoleAndSeniority: legacyWeights.recruiterRoleAndSeniority,
        scaleOrTrackRecord: 0,
        specialism: legacyWeights.specialism,
        targetMarketOperatingDepth: legacyWeights.geographicRelevance ?? 0,
      };
      changed = true;
    } else if (
      weights &&
      typeof weights === "object" &&
      "currentActivity" in weights &&
      typeof weights.currentActivity === "number" &&
      !("currentMandatesOrActivity" in weights)
    ) {
      const legacyWeights = weights as Record<string, unknown>;
      migrated.directoryMatchWeights = {
        currentMandatesOrActivity: legacyWeights.currentActivity,
        evidenceFreshnessAndQuality: legacyWeights.evidenceFreshnessAndQuality,
        namedRecruiterOrTeamEvidence: 0,
        recruiterRoleAndSeniority: legacyWeights.recruiterRoleAndSeniority,
        scaleOrTrackRecord: 0,
        specialism: legacyWeights.specialism,
        targetMarketOperatingDepth: 0,
      };
      changed = true;
    }
  } else {
    migrated.directoryMatchWeights = defaultRecruiterResearchSettings.directoryMatchWeights;
    changed = true;
  }
  if (!("publicSearch" in migrated)) {
    migrated.publicSearch = defaultRecruiterResearchSettings.publicSearch;
    changed = true;
  } else if (
    JSON.stringify(migrated.publicSearch) === JSON.stringify(legacyTechnologyPublicSearchSettings)
  ) {
    migrated.publicSearch = defaultRecruiterResearchSettings.publicSearch;
    changed = true;
  }
  if ("execution" in migrated) {
    delete migrated.execution;
    changed = true;
  }
  if (changed) {
    database
      .update(recruiterResearchSettings)
      .set({ value: migrated, updatedAt: now })
      .where(eq(recruiterResearchSettings.key, "default"))
      .run();
  }
}
