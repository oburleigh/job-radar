import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";
import ApplicationDetailPage from "./application-detail";
import OpportunityDetailPage from "./opportunity-detail";

it.each(["assessment", "relationship-plan"])(
  "retains %s provenance and newer failure after reload",
  (kind) => {
    const metadata = {
      model: "saved-model",
      reasoningEffort: "high",
      policyVersion: 7,
      schemaVersion: 2,
      createdAt: new Date("2026-09-16T10:00:00Z"),
      evidenceCutoff: new Date("2026-09-15T09:00:00Z"),
    };
    const data = {
      advisorEnabled: false,
      applicationStartAvailable: false,
      application: { id: 41, stage: "applied" },
      opportunity: {
        title: "Example role",
        companyName: "Example",
        listingIsActive: true,
        description: "Real job details",
        searchCriteria: { titleTerms: [], locationTerms: [], requiredJobTerms: [] },
      },
      nextActions: [],
      recommendations: [],
      timeline: [],
      assessment: {
        ...metadata,
        summary: { text: "Saved assessment", evidenceUrls: [] },
        strengths: [],
        gaps: [],
        evidence: [],
        recommendations: [],
      },
      relationshipPlan: {
        ...metadata,
        summary: "Saved plan",
        prospectReferences: [],
        publicPeople: [],
      },
      latestExecution: {
        status: "rejected",
        reason: "Unsupported evidence",
        startedAt: new Date("2026-09-16T11:00:00Z"),
      },
    };
    const router = createMemoryRouter(
      [
        {
          id: "detail",
          path: "/",
          Component: kind === "assessment" ? OpportunityDetailPage : ApplicationDetailPage,
        },
      ],
      { hydrationData: { loaderData: { detail: data } } },
    );
    const html = renderToStaticMarkup(<RouterProvider router={router} />);
    expect(html).toContain("Latest Advisor attempt: rejected");
    expect(html).toContain("Unsupported evidence");
    expect(html).toContain("earlier successful attempt");
    expect(html).toContain("Created: 2026-09-16T10:00:00.000Z");
    expect(html).toContain("Evidence cutoff: 2026-09-15T09:00:00.000Z");
    expect(html).toContain("Model: saved-model");
    expect(html).toContain("Reasoning effort: high");
    expect(html).toContain("Policy version: 7");
    expect(html).toContain("Schema version: 2");
    router.dispose();
  },
);
