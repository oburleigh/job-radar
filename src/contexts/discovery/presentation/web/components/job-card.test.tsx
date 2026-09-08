import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";

import { JobCard } from "./job-card";

it("renders the location uncertainty in the visible match summary", () => {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <JobCard
          profileId={1}
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
    expect(markup).toContain(
      "Title matches Engineering Manager · Location uncertain: check eligibility for United Kingdom",
    );
  } finally {
    router.dispose();
  }
});
