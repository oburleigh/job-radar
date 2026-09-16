import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";

import { JobCard } from "./job-card";

it.each([
  {
    application: null,
    expectedLabel: "Start Application",
    rejectedLabel: "Open Application",
    href: "/applications/new?searchProfileId=1&amp;jobListingId=1",
  },
  {
    application: { id: 17, stage: "applied" },
    expectedLabel: "Open Application",
    rejectedLabel: "Start Application",
    href: "/applications/17",
  },
  {
    application: { id: 29, stage: "preparing" },
    expectedLabel: "Open Application",
    rejectedLabel: "Start Application",
    href: "/applications/29",
  },
])(
  "renders the Opportunity and its $expectedLabel destination",
  ({ application, expectedLabel, rejectedLabel, href }) => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <JobCard
            profileId={1}
            application={application}
            atsLabel="Lever"
            job={{
              id: 1,
              title: "Engineering Manager",
              companyName: "Example",
              locationText: "London",
              atsType: "lever",
              canonicalUrl: "https://example.test/role",
              applyUrl: "https://example.test/role",
              department: "Engineering",
              employmentType: "Full-time",
              workplaceType: "remote",
              salary: null,
              publishedAt: null,
              firstSeenAt: new Date("2026-09-08"),
              verified: true,
              score: 95,
              state: "new",
              reasons: [
                { code: "title-match", term: "Engineering Manager" },
                { code: "location-uncertain", term: "United Kingdom" },
                { code: "job-context-match", term: "software" },
              ],
            }}
          />
        ),
      },
    ]);
    try {
      const markup = renderToStaticMarkup(<RouterProvider router={router} />);
      expect(markup).toContain(expectedLabel);
      expect(markup).not.toContain(rejectedLabel);
      expect(markup).toContain(`href="${href}"`);

      expect(markup).toContain(
        "Title matches Engineering Manager · Location uncertain: check eligibility for United Kingdom",
      );
    } finally {
      router.dispose();
    }
  },
);
