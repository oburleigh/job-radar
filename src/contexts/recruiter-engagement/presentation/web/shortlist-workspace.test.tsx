import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import type { ShortlistResult } from "@/contexts/recruiter-engagement/application/shortlists/manage-shortlists";
import { ShortlistWorkspace } from "./shortlist-workspace";

describe("Shortlist workspace", () => {
  it("shows retained public Evidence details when a Prospect has no Contact route", () => {
    const shortlists: readonly ShortlistResult[] = [
      {
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        id: "shortlist-1",
        name: "UAE software recruiters",
        prospects: [
          {
            addedAt: new Date("2026-08-30T10:01:00.000Z"),
            campaignPreparation: {
              eligible: false,
              reasons: ["No current publicly evidenced work Contact route is available."],
            },
            contactExclusion: "none",
            contactRoutes: [],
            evidence: [
              {
                id: "evidence-1",
                observation: {
                  companyName: "Acme Search",
                  evidence: {
                    adapterId: "public-recruiter-directory",
                    confidence: "high",
                    excerpt: "Amina recruits software engineers across the UAE.",
                    observedAt: "2026-08-27",
                    policyVersion: "3",
                    sourceUrl: "https://acme.example/team/amina",
                  },
                  kind: "recruiter",
                  name: "Amina Khan",
                  profileUrl: "https://www.linkedin.com/in/amina-khan",
                  title: "Software Engineering Recruiter",
                },
                recordId: "recruiter:linkedin.com/in/amina-khan",
                runIds: ["run-1"],
              },
            ],
            firm: null,
            recruiter: {
              companyName: "Acme Search",
              firmId: null,
              firstObservedAt: new Date("2026-08-27T10:00:00.000Z"),
              id: "recruiter:linkedin.com/in/amina-khan",
              lastObservedAt: new Date("2026-08-27T10:00:00.000Z"),
              mergedInto: null,
              name: "Amina Khan",
              profileUrl: "https://www.linkedin.com/in/amina-khan",
              title: "Software Engineering Recruiter",
              workEmail: null,
            },
            recruiterId: "recruiter:linkedin.com/in/amina-khan",
          },
        ],
      },
    ];
    const router = createMemoryRouter([
      {
        path: "/",
        element: <ShortlistWorkspace isSubmitting={false} runId="run-1" shortlists={shortlists} />,
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("https://acme.example/team/amina");
    expect(html).toContain("Amina recruits software engineers across the UAE.");
    expect(html).toContain("Observed 2026-08-27");
    expect(html).toContain("high confidence");
    expect(html).toContain("public-recruiter-directory v3");
    expect(html).toContain("1 run");
    expect(html).not.toContain("Retained Evidence:");
  });
});
