import { describe, expect, it } from "vitest";

import { createRecruiterEngagementProspectContract } from "./public-contract.server";

describe("Recruiter Engagement Prospect read contract", () => {
  it("returns each Shortlist Prospect with its composite identity and unique Evidence URLs", async () => {
    const contract = createRecruiterEngagementProspectContract({
      list: async () => [
        {
          id: "shortlist-1",
          prospects: [
            prospect({
              recruiterId: "recruiter-7",
              evidenceUrls: [
                "https://example.test/evidence/alex-profile",
                "https://example.test/evidence/alex-profile",
                "https://example.test/evidence/alex-role",
              ],
            }),
          ],
        },
        {
          id: "shortlist-2",
          prospects: [
            prospect({
              recruiterId: "recruiter-7",
              name: "Alex Morgan",
              evidenceUrls: ["https://example.test/evidence/alex-second-shortlist"],
            }),
            prospect({
              recruiterId: "recruiter-9",
              name: "Sam Lee",
              title: "Executive search partner",
              companyName: "Northstar Search",
              profileUrl: "https://example.test/recruiters/sam",
              evidenceUrls: [],
            }),
          ],
        },
      ],
    });

    await expect(contract.listProspects()).resolves.toEqual([
      {
        shortlistId: "shortlist-1",
        recruiterId: "recruiter-7",
        name: "Alex Morgan",
        title: "Engineering recruiter",
        companyName: "Example Search",
        profileUrl: "https://example.test/recruiters/alex",
        evidenceUrls: [
          "https://example.test/evidence/alex-profile",
          "https://example.test/evidence/alex-role",
        ],
      },
      {
        shortlistId: "shortlist-2",
        recruiterId: "recruiter-7",
        name: "Alex Morgan",
        title: "Engineering recruiter",
        companyName: "Example Search",
        profileUrl: "https://example.test/recruiters/alex",
        evidenceUrls: ["https://example.test/evidence/alex-second-shortlist"],
      },
      {
        shortlistId: "shortlist-2",
        recruiterId: "recruiter-9",
        name: "Sam Lee",
        title: "Executive search partner",
        companyName: "Northstar Search",
        profileUrl: "https://example.test/recruiters/sam",
        evidenceUrls: [],
      },
    ]);
  });
});

function prospect({
  companyName = "Example Search",
  evidenceUrls,
  name = "Alex Morgan",
  profileUrl = "https://example.test/recruiters/alex",
  recruiterId,
  title = "Engineering recruiter",
}: {
  readonly companyName?: string;
  readonly evidenceUrls: readonly string[];
  readonly name?: string;
  readonly profileUrl?: string;
  readonly recruiterId: string;
  readonly title?: string;
}) {
  return {
    recruiterId,
    recruiter: { name, title, companyName, profileUrl },
    evidence: evidenceUrls.map((sourceUrl, index) => ({
      id: `evidence-${index}`,
      observation: { evidence: { sourceUrl } },
    })),
  };
}
