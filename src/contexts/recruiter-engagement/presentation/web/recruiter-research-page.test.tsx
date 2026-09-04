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
            criteriaOptions={testCriteriaOptions}
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            providerSelection={{
              providers: [{ configured: true, label: "Serper.dev", name: "serper" }],
              selectedProvider: "serper",
            }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("Public firm websites");
    expect(html).toContain("public recruiter profile pages");
    expect(html).toContain("No account-linked source is connected");
    expect(html).toContain("Search provider");
  });

  it("omits provider selection when the wired source does not use a public search provider", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RecruiterResearchPage
            criteriaOptions={testCriteriaOptions}
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("Codex CLI installed on this machine");
    expect(html).toContain("No account-linked source is connected");
    expect(html).not.toContain("Search provider");
    expect(html).not.toContain("Configure a search provider");
    expect(html).not.toContain('name="providerName"');
  });

  it("keeps research startable when no public search provider is selectable", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RecruiterResearchPage
            criteriaOptions={testCriteriaOptions}
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).not.toContain('disabled=""');
    expect(html).toContain("Start research");
  });

  it("directs the user to configuration instead of submitting an unavailable provider", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RecruiterResearchPage
            criteriaOptions={testCriteriaOptions}
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            providerSelection={{
              providers: [{ configured: false, label: "Brave Search", name: "brave" }],
              selectedProvider: "brave",
            }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("Configure a search provider first");
    expect(html).toContain('href="/settings/recruiter-search/public-search"');
    expect(html).toContain('disabled=""');
    expect(html).toContain("Start research");
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
            criteriaOptions={testCriteriaOptions}
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            providerSelection={{
              providers: [{ configured: true, label: "Serper.dev", name: "serper" }],
              selectedProvider: "serper",
            }}
            research={{
              coverage: createResearchCoverage({ run, observations }),
              directory,
              failures: [],
              observations,
              run,
              shortlists,
            }}
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
            criteriaOptions={testCriteriaOptions}
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            providerSelection={{
              providers: [{ configured: true, label: "Serper.dev", name: "serper" }],
              selectedProvider: "serper",
            }}
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
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("0 observations saved.");
    expect(html).not.toContain("This stage did not start because the run completed.");
  });

  it("offers a continuation over the firms a run already found, distinct from a retry", () => {
    const html = renderCancelledRun("recruiters", [firmObservation(), secondFirmObservation()]);

    expect(html).toContain("Continue with the 2 firms already found");
    expect(html).toContain('value="continue"');
    expect(html).toContain("Retry with the same plan");
  });

  it("offers only a retry when the run never got past the firms stage", () => {
    const html = renderCancelledRun("firms", []);

    expect(html).toContain("Retry with the same plan");
    expect(html).not.toContain("Continue with the");
    expect(html).not.toContain('value="continue"');
  });

  it("names the run a continuation came from", () => {
    const html = renderCancelledRun("recruiters", [firmObservation()], "run-original");

    expect(html).toContain("Continued from run-original");
  });
});

function renderCancelledRun(
  checkpoint: "firms" | "recruiters",
  observations: readonly ReturnType<typeof firmObservation>[],
  continuedFromRunId: string | null = null,
): string {
  const brief = testSearchBrief({
    description: "Software engineering",
    firmTarget: 1,
    recruiterTarget: 1,
  });
  const run = {
    ...createResearchRun({
      brief,
      id: "run-cancelled",
      policy: testAdapterPolicy,
      sourcePlan: testSourcePlan,
      startedAt: new Date("2026-08-28T10:00:00.000Z"),
    }),
    checkpoint,
    completionReason: "Cancelled by the user before the next source result was accepted.",
    continuedFromRunId,
    finishedAt: new Date("2026-08-28T10:05:00.000Z"),
    status: "cancelled" as const,
  };
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <RecruiterResearchPage
          criteriaOptions={testCriteriaOptions}
          defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
          providerSelection={{
            providers: [{ configured: true, label: "Serper.dev", name: "serper" }],
            selectedProvider: "serper",
          }}
          research={{
            coverage: createResearchCoverage({ run, observations }),
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
            observations,
            run,
            shortlists: [],
          }}
        />
      ),
    },
  ]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function secondFirmObservation() {
  return {
    ...firmObservation(),
    companyName: "Beacon Talent",
    websiteUrl: "https://beacon-talent.example",
  };
}

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

const testCriteriaOptions = {
  industries: ["Technology", "Financial services"],
  specialisms: ["Software engineering", "Data and AI"],
} as const;

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
  execution: null,
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
