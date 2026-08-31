import { describe, expect, it, vi } from "vitest";

import { createResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";
import {
  testAdapterPolicy,
  testSearchBrief,
} from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";

import {
  createLinkedInMcpResearchSource,
  linkedInMcpSourceContract,
} from "./linkedin-mcp-research-source";

describe("LinkedIn MCP ResearchSource adapter", () => {
  it("maps company search and profile evidence into firm observations", async () => {
    const client = toolClient({
      "linkedin.companies.get": companyGetOutput(),
      "linkedin.companies.search": companySearchOutput(),
    });
    const source = createLinkedInMcpResearchSource({
      connect: async () => client,
      createId: idSequence(),
    });
    const run = researchRun();

    await expect(source.findFirms({ run })).resolves.toEqual([
      {
        companyName: "Apex Search",
        evidence: {
          adapterId: linkedInMcpSourceContract.adapterId,
          confidence: "high",
          excerpt: "Apex Search recruits engineering leaders.",
          observedAt: "2026-08-31",
          policyVersion: linkedInMcpSourceContract.policyVersion,
          sourceUrl: "https://www.linkedin.com/company/apex-search/about/",
        },
        industries: ["Staffing and Recruiting"],
        kind: "firm",
        reason: "Specialist engineering recruitment.",
        specialisms: ["Software engineering", "Executive search"],
        websiteUrl: "https://apex-search.example.com/",
      },
    ]);
    expect(client.callTool).toHaveBeenNthCalledWith(1, "linkedin.companies.search", {
      context_id: "id-00000000000000000000000000001",
      filters: {
        industry_names: ["Technology"],
        location_names: ["United Arab Emirates"],
      },
      page_size: 1,
      query: "Engineering recruiters Software engineering",
      request_id: "id-00000000000000000000000000002",
    });
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("maps visible member profiles into recruiters associated with researched firms", async () => {
    const client = toolClient({
      "linkedin.people.get": peopleGetOutput(),
      "linkedin.people.search": peopleSearchOutput(),
    });
    const source = createLinkedInMcpResearchSource({
      connect: async () => client,
      createId: idSequence(),
    });
    const run = researchRun();

    await expect(
      source.findRecruiters({
        firms: [firmObservation()],
        run,
      }),
    ).resolves.toEqual([
      {
        companyName: "Apex Search",
        evidence: {
          adapterId: linkedInMcpSourceContract.adapterId,
          confidence: "high",
          excerpt: "Amina recruits senior software engineers.",
          observedAt: "2026-08-31",
          policyVersion: linkedInMcpSourceContract.policyVersion,
          sourceUrl: "https://www.linkedin.com/in/amina-khan/",
        },
        kind: "recruiter",
        name: "Amina Khan",
        profileUrl: "https://www.linkedin.com/in/amina-khan/",
        title: "Principal Recruiter",
      },
    ]);
    expect(client.callTool).toHaveBeenNthCalledWith(1, "linkedin.people.search", {
      context_id: "id-00000000000000000000000000001",
      filters: {
        current_company_names: ["Apex Search"],
        industry_names: ["Technology"],
        location_names: ["United Arab Emirates"],
      },
      page_size: 1,
      query: "Engineering recruiters Software engineering",
      request_id: "id-00000000000000000000000000002",
      title_keywords: "Recruiter",
    });
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("is unavailable when the frozen Source plan does not permit this adapter", () => {
    const source = createLinkedInMcpResearchSource({
      connect: async () => toolClient({}),
      createId: idSequence(),
    });
    const run = createResearchRun({
      brief: testSearchBrief({ firmTarget: 1, recruiterTarget: 1 }),
      id: "run-1",
      policy: testAdapterPolicy,
      sourcePlan: {
        entries: [],
        id: "source-plan-without-linkedin",
        stageRequestAllowance: { firms: 1, recruiters: 1 },
        version: "1",
      },
      startedAt: new Date("2026-08-31T10:00:00.000Z"),
    });

    expect(source.assess(run)).toEqual({
      available: false,
      message: "The frozen Source plan does not permit the configured recruiter source.",
    });
  });
});

function researchRun() {
  return createResearchRun({
    brief: testSearchBrief({
      description: "Engineering recruiters",
      firmTarget: 1,
      recruiterTarget: 1,
    }),
    id: "run-1",
    policy: testAdapterPolicy,
    sourcePlan: {
      entries: [
        {
          adapterId: linkedInMcpSourceContract.adapterId,
          allowedPublicSources: ["Public company profiles"],
          id: "linkedin-firms",
          policyVersion: linkedInMcpSourceContract.policyVersion,
          stage: "firms",
        },
        {
          adapterId: linkedInMcpSourceContract.adapterId,
          allowedPublicSources: ["Public profiles"],
          id: "linkedin-recruiters",
          policyVersion: linkedInMcpSourceContract.policyVersion,
          stage: "recruiters",
        },
      ],
      id: "source-plan-linkedin",
      stageRequestAllowance: { firms: 1, recruiters: 1 },
      version: "1",
    },
    startedAt: new Date("2026-08-31T10:00:00.000Z"),
  });
}

function toolClient(results: Readonly<Record<string, unknown>>) {
  return {
    callTool: vi.fn(async (name: string) => {
      const result = results[name];
      if (!result) throw new Error(`Unexpected tool: ${name}`);
      return result;
    }),
    close: vi.fn(async () => undefined),
  };
}

function idSequence() {
  let value = 0;
  return () => `id-${String(++value).padStart(29, "0")}`;
}

function firmObservation() {
  return {
    companyName: "Apex Search",
    evidence: {
      adapterId: linkedInMcpSourceContract.adapterId,
      confidence: "high" as const,
      excerpt: "Apex Search recruits engineering leaders.",
      observedAt: "2026-08-31",
      policyVersion: linkedInMcpSourceContract.policyVersion,
      sourceUrl: "https://www.linkedin.com/company/apex-search/about/",
    },
    industries: ["Staffing and Recruiting"],
    kind: "firm" as const,
    reason: "Specialist engineering recruitment.",
    specialisms: ["Software engineering", "Executive search"],
    websiteUrl: "https://apex-search.example.com/",
  };
}

function companySearchOutput() {
  return {
    companies: [
      {
        company_slug: "apex-search",
        company_url: "https://www.linkedin.com/company/apex-search/",
        name: "Apex Search",
        visible_text: "Apex Search · Staffing and Recruiting",
      },
    ],
  };
}

function companyGetOutput() {
  return {
    company: {
      captured_at: "2026-08-31T11:00:00.000Z",
      company_slug: "apex-search",
      company_url: "https://www.linkedin.com/company/apex-search/",
      description: "Specialist engineering recruitment.",
      evidence: [
        {
          field: "description",
          quote: "Apex Search recruits engineering leaders.",
          source_url: "https://www.linkedin.com/company/apex-search/about/",
        },
      ],
      industry: "Staffing and Recruiting",
      name: "Apex Search",
      specialties: ["Software engineering", "Executive search"],
      visible_text: "Apex Search recruits engineering leaders.",
      website_url: "https://apex-search.example.com/",
    },
  };
}

function peopleSearchOutput() {
  return {
    people: [
      {
        name: "Amina Khan",
        profile_slug: "amina-khan",
        profile_url: "https://www.linkedin.com/in/amina-khan/",
        visible_text: "Amina Khan · Principal Recruiter at Apex Search",
      },
    ],
  };
}

function peopleGetOutput() {
  return {
    person: {
      captured_at: "2026-08-31T11:30:00.000Z",
      evidence: [
        {
          field: "experience",
          quote: "Amina recruits senior software engineers.",
          source_url: "https://www.linkedin.com/in/amina-khan/",
        },
      ],
      experiences: [
        {
          is_current: true,
          organization: "Apex Search",
          source_url: "https://www.linkedin.com/in/amina-khan/details/experience/",
          title: "Principal Recruiter",
          visible_text: "Principal Recruiter at Apex Search",
        },
      ],
      name: "Amina Khan",
      profile_slug: "amina-khan",
      profile_url: "https://www.linkedin.com/in/amina-khan/",
      visible_text: "Amina Khan · Principal Recruiter at Apex Search",
    },
  };
}
