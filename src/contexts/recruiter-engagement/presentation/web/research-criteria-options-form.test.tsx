import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { ResearchCriteriaOptionsForm } from "./research-criteria-options-form";

describe("research criteria options form", () => {
  it("keeps catalogue editing in a compact disclosure", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <ResearchCriteriaOptionsForm
            options={{
              industries: ["Technology", "Financial services"],
              specialisms: ["Software engineering", "Data and AI"],
            }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("Research criteria");
    expect(html).toContain("Edit industries and Specialisms");
    expect(html).toContain('name="industries"');
    expect(html).toContain('name="specialisms"');
    expect(html).toContain("Technology\nFinancial services");
  });
});
