import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { expect, it } from "vitest";

import ApplicationDetailPage, { loader } from "./application-detail";

it.each([true, false])(
  "distinguishes the listing's current or closed state (%s)",
  (listingIsActive) => {
    const router = createMemoryRouter(
      [{ id: "application", path: "/", Component: ApplicationDetailPage, loader }],
      {
        hydrationData: {
          loaderData: {
            application: {
              application: { id: 41, stage: "applied" },
              opportunity: { title: "Example role", companyName: "Example", listingIsActive },
              nextActions: [],
              recommendations: [],
              timeline: [],
              relationshipPlan: null,
              advisorEnabled: false,
            },
          },
        },
      },
    );
    const html = renderToStaticMarkup(<RouterProvider router={router} />);
    expect(html).toContain(listingIsActive ? "Listing current" : "Listing closed");
    expect(html).not.toContain("Listing closed or stale");
    router.dispose();
  },
);
