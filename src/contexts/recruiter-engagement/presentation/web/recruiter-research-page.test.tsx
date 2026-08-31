import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import type { Evidence } from "@/contexts/recruiter-engagement/domain/observation";
import {
  createEmptyRecruiterDirectory,
  rankRecruiterDirectory,
  reconcileRecruiterDirectory,
} from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import {
  type AdapterPolicySnapshot,
  createResearchCoverage,
  createResearchRun,
  createSearchBrief,
  type SourcePlanSnapshot,
} from "@/contexts/recruiter-engagement/domain/research-run";
import {
  addRecruiterToShortlist,
  assessShortlist,
  createShortlist,
} from "@/contexts/recruiter-engagement/domain/shortlist";
import { RecruiterResearchPage } from "./recruiter-research-page";

describe("recruiter research page", () => {
  it("explains the active public sources before research starts", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RecruiterResearchPage
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            providers={[{ configured: true, label: "Serper.dev", name: "serper" }]}
            selectedProvider="serper"
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("Public firm websites");
    expect(html).toContain("public recruiter profile pages");
    expect(html).toContain("No account-linked source is connected");
  });

  it("shows the canonical directory with retained evidence and match reasons", () => {
    const brief = testSearchBrief({
      description: "Software engineering",
      firmTarget: 1,
      recruiterTarget: 1,
    });
    const run = createResearchRun({
      brief,
      id: "run-1",
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-28T10:00:00.000Z"),
    });
    const observations = [
      firmObservation(),
      {
        ...recruiterObservation(),
        workEmail: {
          address: "amina@acme.example",
          evidence: testEvidence("https://acme.example/team/amina"),
        },
      },
      {
        ...recruiterObservation(),
        companyName: "Unresolved Search",
        evidence: testEvidence("https://www.linkedin.com/in/zara-ali"),
        profileUrl: "https://www.linkedin.com/in/zara-ali",
        name: "Zara Ali",
      },
      {
        ...recruiterObservation(),
        companyName: "Unresolved Search",
        evidence: testEvidence("https://www.linkedin.com/in/zara-ali-alt"),
        profileUrl: "https://www.linkedin.com/in/zara-ali-alt",
        name: "Zara Ali",
      },
    ];
    const first = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations,
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const refreshed = reconcileRecruiterDirectory(first, {
      observations,
      recordedAt: new Date("2026-08-29T10:00:00.000Z"),
      runId: "run-2",
    });
    const directory = rankRecruiterDirectory(refreshed, {
      asOf: new Date("2026-08-29T12:00:00.000Z"),
      brief,
      weights: {
        currentMandatesOrActivity: 15,
        evidenceFreshnessAndQuality: 10,
        namedRecruiterOrTeamEvidence: 10,
        recruiterRoleAndSeniority: 15,
        scaleOrTrackRecord: 10,
        specialism: 20,
        targetMarketOperatingDepth: 20,
      },
    });
    const shortlists = [
      assessShortlist(
        addRecruiterToShortlist(
          createShortlist({
            createdAt: new Date("2026-08-29T10:00:00.000Z"),
            id: "shortlist-1",
            name: "UAE software recruiters",
          }),
          refreshed,
          {
            addedAt: new Date("2026-08-29T10:01:00.000Z"),
            recruiterId: "recruiter:linkedin.com/in/amina-khan",
          },
        ),
        refreshed,
      ),
    ];
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RecruiterResearchPage
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            providers={[{ configured: true, label: "Serper.dev", name: "serper" }]}
            research={{
              coverage: createResearchCoverage({ run, observations }),
              directory,
              failures: [],
              observations,
              run,
              shortlists,
            }}
            selectedProvider="serper"
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html.match(/<h3>Acme Search<\/h3>/g)).toHaveLength(1);
    expect(html).toContain("Amina Khan");
    expect(html).toContain("Unassociated recruiters");
    expect(html).toContain("Zara Ali");
    expect(html).toContain("Zara Ali and Zara Ali");
    expect(html).toContain("Specialism matches Software engineering.");
    expect(html).toContain("Qualified recruitment firm");
    expect(html).toContain("Specialism · 20 points");
    expect(html).toContain("Scale or track record · 0 points");
    expect(html).toContain("Recruiter role and seniority · 15 points");
    expect(html).toContain("2 runs");
    expect(html).toContain("Public profile");
    expect(html).not.toContain("Public LinkedIn profile");
    expect(html).toContain("Shortlists");
    expect(html).toContain("UAE software recruiters");
    expect(html).toContain("Eligible for Campaign preparation");
    expect(html).toContain("Work email: amina@acme.example");
    expect(html).toContain("Prior engagement: None recorded");
    expect(html).toContain("Add to Shortlist");
    expect(html).toContain("Do Not Contact");
    expect(html).not.toContain(">Candidate<");
    expect(html).not.toContain(">DNC<");
  });

  it("records a completed recruiter stage when it found zero observations", () => {
    const brief = testSearchBrief({
      description: "Software engineering",
      firmTarget: 1,
      recruiterTarget: 1,
    });
    const started = createResearchRun({
      brief,
      id: "run-zero-recruiters",
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-28T10:00:00.000Z"),
    });
    const run = { ...started, checkpoint: "completed" as const, status: "completed" as const };
    const sourcePlan = {
      ...testSourcePlan,
      entries: [
        ...testSourcePlan.entries,
        {
          adapterId: testAdapterPolicy.id,
          allowedPublicSources: ["Public professional profile pages"],
          id: "recruiters",
          policyVersion: "1",
          stage: "recruiters" as const,
        },
      ],
    };
    const completedRun = { ...run, sourcePlan };
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RecruiterResearchPage
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            providers={[{ configured: true, label: "Serper.dev", name: "serper" }]}
            research={{
              coverage: createResearchCoverage({ run: completedRun, observations: [] }),
              directory: rankRecruiterDirectory(createEmptyRecruiterDirectory(), {
                asOf: new Date("2026-08-28T12:00:00.000Z"),
                brief,
                weights: {
                  currentMandatesOrActivity: 15,
                  evidenceFreshnessAndQuality: 10,
                  namedRecruiterOrTeamEvidence: 10,
                  recruiterRoleAndSeniority: 15,
                  scaleOrTrackRecord: 10,
                  specialism: 20,
                  targetMarketOperatingDepth: 20,
                },
              }),
              failures: [],
              observations: [],
              run: completedRun,
              shortlists: [],
            }}
            selectedProvider="serper"
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("0 observations saved.");
    expect(html).not.toContain("This stage did not start because the run completed.");
  });
});

function firmObservation() {
  return {
    companyName: "Acme Search",
    evidence: testEvidence("https://acme.example/evidence"),
    industries: ["Financial services"],
    kind: "firm" as const,
    rankingSignals: {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: true,
      scaleOrTrackRecord: false,
      targetMarkets: ["United Arab Emirates"],
    },
    reason: "Software engineering recruitment",
    specialisms: ["Software engineering"],
    websiteUrl: "https://acme.example",
  };
}

function recruiterObservation() {
  return {
    companyName: "Acme Search",
    evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
    kind: "recruiter" as const,
    profileUrl: "https://www.linkedin.com/in/amina-khan",
    name: "Amina Khan",
    title: "Software Engineering Recruiter",
  };
}

const testAdapterPolicy: AdapterPolicySnapshot = {
  allowedPublicSourceScope: ["Public firm pages", "Public LinkedIn profiles"],
  authorization: { reference: "test", reviewedOn: "2026-08-27" },
  disabledBehavior: "Reject before request.",
  enabled: true,
  id: "public-web-search:serper:v1",
  permittedOperations: ["Public web search"],
  permittedPublicData: ["Public evidence"],
  rateLimit: { stageRequestLimit: 1, subscriptionExhaustionBehavior: "Stop." },
  retention: { deletionRule: "Delete fixture data.", rule: "Public evidence only." },
  version: "1",
};

const testSourcePlan: SourcePlanSnapshot = {
  entries: [
    {
      adapterId: testAdapterPolicy.id,
      allowedPublicSources: ["Public firm pages"],
      id: "firms",
      policyVersion: "1",
      stage: "firms",
    },
  ],
  id: "public-web-v1",
  publicSearch: null,
  stageRequestAllowance: { firms: 1, recruiters: 1 },
  version: "1",
};

function testSearchBrief(overrides: {
  readonly description: string;
  readonly firmTarget: number;
  readonly recruiterTarget: number;
}) {
  return createSearchBrief({
    criteria: {
      industries: ["Financial services"],
      specialisms: ["Software engineering"],
      targetLocations: ["United Arab Emirates"],
    },
    ...overrides,
  });
}

function testEvidence(sourceUrl: string): Evidence {
  return {
    adapterId: testAdapterPolicy.id,
    confidence: "high",
    excerpt: "Public evidence fixture.",
    observedAt: "2026-08-27",
    policyVersion: "1",
    sourceUrl,
  };
}
