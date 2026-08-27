import type { ResearchSource } from "@/contexts/recruiter-engagement/application/research-runs/port";
import type {
  FirmObservation,
  RecruiterObservation,
} from "@/contexts/recruiter-engagement/domain/observation";

type DeterministicStagedResearchSourceOptions = {
  readonly failStage?: "firms" | "recruiters";
  readonly pauseRecruiters?: () => Promise<void>;
};

export function createDeterministicStagedResearchSource(
  options: DeterministicStagedResearchSourceOptions = {},
): ResearchSource {
  return {
    assess: () => ({ available: true }),
    async findFirms({ run }) {
      if (options.failStage === "firms") {
        throw new Error("The firm source stage was unavailable.");
      }
      const count = run.budget.firmTarget;
      return Array.from({ length: count }, (_, index): FirmObservation => {
        const number = index + 1;
        return {
          kind: "firm",
          companyName: `UAE Technology Search ${number}`,
          websiteUrl: `https://uae-technology-search-${number}.example`,
          reason: "Deterministic technology recruitment fixture.",
          industries: ["Financial services", "Technology"],
          specialisms: ["Software engineering", "Data and AI"],
          evidence: {
            adapterId: run.policy.id,
            confidence: "high",
            excerpt: "Deterministic public-source fixture for technology recruitment.",
            observedAt: "2026-08-27",
            policyVersion: run.policy.version,
            sourceUrl: `https://uae-technology-search-${number}.example/evidence`,
          },
        };
      });
    },
    async findRecruiters({ run, firms }) {
      await options.pauseRecruiters?.();
      if (options.failStage === "recruiters") {
        throw new Error("The recruiter source stage was unavailable.");
      }
      return Array.from({ length: run.brief.recruiterTarget }, (_, index): RecruiterObservation => {
        const number = index + 1;
        const firm = firms[index % firms.length];
        if (!firm) {
          throw new Error("The recruiter stage requires at least one firm observation.");
        }
        return {
          kind: "recruiter",
          name: `Technology Recruiter ${number}`,
          title: "Technology Recruiter",
          companyName: firm.companyName,
          linkedInUrl: `https://www.linkedin.com/in/technology-recruiter-${number}`,
          evidence: {
            adapterId: run.policy.id,
            confidence: "high",
            excerpt: "Deterministic public LinkedIn-profile fixture.",
            observedAt: "2026-08-27",
            policyVersion: run.policy.version,
            sourceUrl: `https://www.linkedin.com/in/technology-recruiter-${number}`,
          },
        };
      });
    },
  };
}
