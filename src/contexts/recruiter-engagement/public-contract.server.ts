export { parseDirectoryMatchSettingsRequest } from "./presentation/web/requests/directory-match-settings-request";
export { parseExecutionSettingsRequest } from "./presentation/web/requests/execution-settings-request";
export { parsePublicSearchSettingsRequest } from "./presentation/web/requests/public-search-settings-request";
export { parseResearchCriteriaOptionsRequest } from "./presentation/web/requests/research-criteria-options-request";

import { recruiterEngagementWeb } from "./composition/recruiter-engagement-web.server";
import { isActiveResearchRunActivity, type ResearchRunActivity } from "./public-contract";

export interface RecruiterEngagementProspect {
  readonly shortlistId: string;
  readonly recruiterId: string;
  readonly name: string;
  readonly title: string;
  readonly companyName: string;
  readonly profileUrl: string;
  readonly evidenceUrls: readonly string[];
}

interface ProspectReader {
  readonly list: () => Promise<
    readonly {
      readonly id: string;
      readonly prospects: readonly {
        readonly recruiterId: string;
        readonly recruiter: {
          readonly name: string;
          readonly title: string;
          readonly companyName: string;
          readonly profileUrl: string;
        };
        readonly evidence: readonly {
          readonly observation: { readonly evidence: { readonly sourceUrl: string } };
        }[];
      }[];
    }[]
  >;
}

export function createRecruiterEngagementProspectContract(shortlists: ProspectReader) {
  return {
    async listProspects(): Promise<readonly RecruiterEngagementProspect[]> {
      return (await shortlists.list()).flatMap((shortlist) =>
        shortlist.prospects.map((prospect) => ({
          shortlistId: shortlist.id,
          recruiterId: prospect.recruiterId,
          name: prospect.recruiter.name,
          title: prospect.recruiter.title,
          companyName: prospect.recruiter.companyName,
          profileUrl: prospect.recruiter.profileUrl,
          evidenceUrls: [
            ...new Set(prospect.evidence.map((item) => item.observation.evidence.sourceUrl)),
          ],
        })),
      );
    },
  };
}

export const recruiterEngagementProspectContract = createRecruiterEngagementProspectContract(
  recruiterEngagementWeb.shortlists,
);

export const recruiterResearchSettingsContract = {
  getDirectoryMatchWeights: recruiterEngagementWeb.getDirectoryMatchWeights,
  getExecutionSettings: recruiterEngagementWeb.getExecutionSettings,
  executionSettingsGovernRuns: recruiterEngagementWeb.executionSettingsGovernRuns,
  publicSearchSettingsGovernRuns: recruiterEngagementWeb.publicSearchSettingsGovernRuns,
  getPublicSearchSettings: recruiterEngagementWeb.getPublicSearchSettings,
  getResearchCriteriaOptions: recruiterEngagementWeb.getResearchCriteriaOptions,
  getPublicSearchProviderOptions: recruiterEngagementWeb.getPublicSearchProviderOptions,
  savePublicSearchSettings: recruiterEngagementWeb.savePublicSearchSettings,
  saveResearchCriteriaOptions: recruiterEngagementWeb.saveResearchCriteriaOptions,
  saveDirectoryMatchWeights: recruiterEngagementWeb.saveDirectoryMatchWeights,
  saveExecutionSettings: recruiterEngagementWeb.saveExecutionSettings,
};

export const recruiterActivityContract = {
  listResearchRuns: (): Promise<readonly ResearchRunActivity[]> =>
    recruiterEngagementWeb.listResearchRuns(),
  countActiveResearchRuns: async (): Promise<number> =>
    (await recruiterEngagementWeb.listResearchRuns()).filter(isActiveResearchRunActivity).length,
};
