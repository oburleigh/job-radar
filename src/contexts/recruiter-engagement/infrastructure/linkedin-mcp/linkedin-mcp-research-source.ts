import { z } from "zod";

import type { ResearchSource } from "@/contexts/recruiter-engagement/application/research-runs/port";
import type {
  Evidence,
  FirmObservation,
  RecruiterObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import type {
  ResearchRun,
  ResearchStage,
  SourcePlanEntry,
} from "@/contexts/recruiter-engagement/domain/research-run";

import type { LinkedInMcpToolClient } from "./linkedin-mcp-readiness";

export const linkedInMcpSourceContract = {
  adapterId: "linkedin-mcp-v1",
  policyVersion: "1",
} as const;

const profileEvidenceSchema = z.object({
  field: z.string().trim().min(1),
  quote: z.string().trim().min(1),
  source_url: z.url(),
});

const companySearchSchema = z.object({
  companies: z.array(
    z.object({
      company_slug: z.string().trim().min(1),
      company_url: z.url(),
      name: z.string().trim().min(1),
      visible_text: z.string().trim().min(1),
    }),
  ),
});

const companyGetSchema = z.object({
  company: z.object({
    captured_at: z.iso.datetime(),
    company_url: z.url(),
    description: z.string().trim().min(1).nullable().optional(),
    evidence: z.array(profileEvidenceSchema),
    industry: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1),
    specialties: z.array(z.string().trim().min(1)),
    tagline: z.string().trim().min(1).nullable().optional(),
    visible_text: z.string().trim().min(1),
    website_url: z.url().nullable().optional(),
  }),
});

const peopleSearchSchema = z.object({
  people: z.array(
    z.object({
      name: z.string().trim().min(1),
      profile_slug: z.string().trim().min(1),
      profile_url: z.url(),
      visible_text: z.string().trim().min(1),
    }),
  ),
});

const peopleGetSchema = z.object({
  person: z.object({
    captured_at: z.iso.datetime(),
    current_company_text: z.string().trim().min(1).nullable().optional(),
    evidence: z.array(profileEvidenceSchema),
    experiences: z.array(
      z.object({
        is_current: z.boolean().nullable().optional(),
        organization: z.string().trim().min(1).nullable().optional(),
        title: z.string().trim().min(1).nullable().optional(),
        visible_text: z.string().trim().min(1),
      }),
    ),
    headline: z.string().trim().min(1).nullable().optional(),
    name: z.string().trim().min(1),
    profile_url: z.url(),
    visible_text: z.string().trim().min(1),
  }),
});

type LinkedInMcpResearchSourceOptions = {
  readonly connect: () => Promise<LinkedInMcpToolClient>;
  readonly createId: () => string;
};

export function createLinkedInMcpResearchSource({
  connect,
  createId,
}: LinkedInMcpResearchSourceOptions): ResearchSource {
  return {
    adapterId: linkedInMcpSourceContract.adapterId,
    assess(run) {
      const permitted = (["firms", "recruiters"] as const).every((stage) =>
        findSourcePlanEntry(run, stage),
      );
      return permitted
        ? { available: true }
        : {
            available: false,
            message: "The frozen Source plan does not permit the configured recruiter source.",
          };
    },
    async findFirms({ run, signal }) {
      const plan = requireSourcePlanEntry(run, "firms");
      if (signal?.aborted) return [];
      const client = await connect();
      try {
        const contextId = createId();
        const search = companySearchSchema.parse(
          await client.callTool("linkedin.companies.search", {
            context_id: contextId,
            filters: searchFilters(run),
            page_size: Math.min(run.budget.firmTarget, 100),
            query: searchQuery(run),
            request_id: createId(),
          }),
        );
        const observations: FirmObservation[] = [];
        for (const summary of search.companies.slice(0, run.budget.firmTarget)) {
          if (signal?.aborted) break;
          const { company } = companyGetSchema.parse(
            await client.callTool("linkedin.companies.get", {
              company_slug: summary.company_slug,
              context_id: contextId,
              request_id: createId(),
            }),
          );
          if (!company.website_url?.startsWith("https://")) continue;
          const retainedEvidence = company.evidence[0];
          observations.push({
            companyName: company.name,
            evidence: sourceEvidence({
              capturedAt: company.captured_at,
              excerpt: retainedEvidence?.quote ?? company.visible_text,
              plan,
              sourceUrl: retainedEvidence?.source_url ?? company.company_url,
            }),
            industries: company.industry ? [company.industry] : run.brief.criteria.industries,
            kind: "firm",
            reason: company.description ?? company.tagline ?? company.visible_text,
            specialisms:
              company.specialties.length > 0 ? company.specialties : run.brief.criteria.specialisms,
            websiteUrl: company.website_url,
          });
        }
        return observations;
      } finally {
        await client.close();
      }
    },
    async findRecruiters({ run, firms, signal }) {
      const plan = requireSourcePlanEntry(run, "recruiters");
      if (signal?.aborted) return [];
      const client = await connect();
      try {
        const contextId = createId();
        const searchedFirms = firms.slice(0, 10);
        const search = peopleSearchSchema.parse(
          await client.callTool("linkedin.people.search", {
            context_id: contextId,
            filters: {
              current_company_names: searchedFirms.map((firm) => firm.companyName),
              ...searchFilters(run),
            },
            page_size: Math.min(run.brief.recruiterTarget, 100),
            query: searchQuery(run),
            request_id: createId(),
            title_keywords: "Recruiter",
          }),
        );
        const observations: RecruiterObservation[] = [];
        for (const summary of search.people.slice(0, run.brief.recruiterTarget)) {
          if (signal?.aborted) break;
          const { person } = peopleGetSchema.parse(
            await client.callTool("linkedin.people.get", {
              context_id: contextId,
              profile_slug: summary.profile_slug,
              request_id: createId(),
              sections: ["all"],
            }),
          );
          const currentExperience = person.experiences.find(
            (experience) => experience.is_current === true && experience.organization,
          );
          const firm = matchFirm(
            searchedFirms,
            currentExperience?.organization ?? person.current_company_text ?? "",
          );
          const title = currentExperience?.title ?? person.headline;
          if (!firm || !title) continue;
          const retainedEvidence = person.evidence[0];
          observations.push({
            companyName: firm.companyName,
            evidence: sourceEvidence({
              capturedAt: person.captured_at,
              excerpt: retainedEvidence?.quote ?? person.visible_text,
              plan,
              sourceUrl: retainedEvidence?.source_url ?? person.profile_url,
            }),
            kind: "recruiter",
            name: person.name,
            profileUrl: person.profile_url,
            title,
          });
        }
        return observations;
      } finally {
        await client.close();
      }
    },
  };
}

function searchFilters(run: ResearchRun) {
  return {
    industry_names: run.brief.criteria.industries.slice(0, 10),
    location_names: run.brief.criteria.targetLocations.slice(0, 10),
  };
}

function searchQuery(run: ResearchRun): string {
  return [run.brief.description, ...run.brief.criteria.specialisms]
    .filter((value) => value.trim() !== "")
    .join(" ")
    .slice(0, 500);
}

function findSourcePlanEntry(
  run: ResearchRun,
  stage: Exclude<ResearchStage, "completed">,
): SourcePlanEntry | undefined {
  return run.sourcePlan.entries.find(
    (entry) =>
      entry.stage === stage &&
      entry.adapterId === linkedInMcpSourceContract.adapterId &&
      entry.policyVersion === linkedInMcpSourceContract.policyVersion,
  );
}

function requireSourcePlanEntry(
  run: ResearchRun,
  stage: Exclude<ResearchStage, "completed">,
): SourcePlanEntry {
  const entry = findSourcePlanEntry(run, stage);
  if (!entry) {
    throw new Error("The frozen Source plan does not permit the configured recruiter source.");
  }
  return entry;
}

function sourceEvidence(input: {
  readonly capturedAt: string;
  readonly excerpt: string;
  readonly plan: SourcePlanEntry;
  readonly sourceUrl: string;
}): Evidence {
  return {
    adapterId: input.plan.adapterId,
    confidence: "high",
    excerpt: input.excerpt,
    observedAt: input.capturedAt.slice(0, 10),
    policyVersion: input.plan.policyVersion,
    sourceUrl: input.sourceUrl,
  };
}

function matchFirm(
  firms: readonly FirmObservation[],
  observedCompanyName: string,
): FirmObservation | undefined {
  const observed = normaliseName(observedCompanyName);
  return firms.find((firm) => {
    const name = normaliseName(firm.companyName);
    return observed === name || observed.includes(name);
  });
}

function normaliseName(value: string): string {
  return value.trim().toLocaleLowerCase("en").replace(/\s+/g, " ");
}
