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
import { RecruiterResearchPage } from "./recruiter-research-page";

describe("recruiter research page", () => {
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
      recruiterObservation(),
      {
        ...recruiterObservation(),
        companyName: "Unresolved Search",
        evidence: testEvidence("https://www.linkedin.com/in/zara-ali"),
        linkedInUrl: "https://www.linkedin.com/in/zara-ali",
        name: "Zara Ali",
      },
      {
        ...recruiterObservation(),
        companyName: "Unresolved Search",
        evidence: testEvidence("https://www.linkedin.com/in/zara-ali-alt"),
        linkedInUrl: "https://www.linkedin.com/in/zara-ali-alt",
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
        currentActivity: 15,
        evidenceFreshnessAndQuality: 10,
        recruiterRoleAndSeniority: 15,
        specialism: 60,
      },
    });
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <RecruiterResearchPage
            defaultTargets={{ firmTarget: 10, recruiterTarget: 20 }}
            execution={{ model: null, reasoningEffort: null }}
            research={{
              coverage: createResearchCoverage({ run, observations }),
              directory,
              failures: [],
              observations,
              run,
            }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html.match(/Acme Search/g)).toHaveLength(1);
    expect(html).toContain("Amina Khan");
    expect(html).toContain("Unassociated recruiters");
    expect(html).toContain("Zara Ali");
    expect(html).toContain("Zara Ali and Zara Ali");
    expect(html).toContain("Specialism matches Software engineering.");
    expect(html).toContain("2 runs");
  });
});

function firmObservation() {
  return {
    companyName: "Acme Search",
    evidence: testEvidence("https://acme.example/evidence"),
    industries: ["Financial services"],
    kind: "firm" as const,
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
    linkedInUrl: "https://www.linkedin.com/in/amina-khan",
    name: "Amina Khan",
    title: "Software Engineering Recruiter",
  };
}

const testAdapterPolicy: AdapterPolicySnapshot = {
  allowedPublicSourceScope: ["Public firm pages", "Public LinkedIn profiles"],
  authorization: { reference: "test", reviewedOn: "2026-08-27" },
  disabledBehavior: "Reject before request.",
  enabled: true,
  execution: {
    automaticRetry: false,
    ephemeral: true,
    model: null,
    reasoningEffort: null,
    sandboxMode: "read-only",
    webSearchEnabled: true,
  },
  id: "local-codex-cli-web-search-v1",
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
