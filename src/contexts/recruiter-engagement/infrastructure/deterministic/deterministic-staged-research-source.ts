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
    adapterId: "deterministic-research-source",
    assess: () => ({ available: true }),
    async findFirms({ reserveRequest, run }) {
      if (!(await reserveRequest())) return [];
      if (options.failStage === "firms") {
        throw new Error("The firm source stage was unavailable.");
      }
      const count = run.budget.firmTarget;
      const observedAt = run.startedAt.toISOString().slice(0, 10);
      return Array.from({ length: count }, (_, index): FirmObservation => {
        const number = index + 1;
        return {
          kind: "firm",
          companyName: `Recruitment Search ${number}`,
          websiteUrl: `https://recruitment-search-${number}.example`,
          reason: run.brief.description,
          industries: run.brief.criteria.industries,
          rankingSignals: {
            currentMandatesOrActivity: true,
            namedRecruiterOrTeamEvidence: true,
            scaleOrTrackRecord: true,
            targetMarkets: run.brief.criteria.targetLocations,
          },
          specialisms: run.brief.criteria.specialisms,
          evidence: {
            adapterId: run.policy.id,
            confidence: "high",
            excerpt: "Deterministic public-source fixture for technology recruitment.",
            observedAt,
            policyVersion: run.policy.version,
            sourceUrl: `https://recruitment-search-${number}.example/evidence`,
          },
        };
      });
    },
    async findRecruiters({ run, firms, reserveRequest }) {
      if (!(await reserveRequest())) return [];
      await options.pauseRecruiters?.();
      if (options.failStage === "recruiters") {
        throw new Error("The recruiter source stage was unavailable.");
      }
      const observedAt = run.startedAt.toISOString().slice(0, 10);
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
          profileUrl: `https://www.linkedin.com/in/technology-recruiter-${number}`,
          evidence: {
            adapterId: run.policy.id,
            confidence: "high",
            excerpt: "Deterministic public LinkedIn-profile fixture.",
            observedAt,
            policyVersion: run.policy.version,
            sourceUrl: `https://www.linkedin.com/in/technology-recruiter-${number}`,
          },
        };
      });
    },
  };
}
