import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { RecruiterLocationCombobox } from "./recruiter-location-combobox";

describe("recruiter location combobox", () => {
  it("uses the shared local location autocomplete rather than presentation-owned locations", () => {
    const html = renderWithRouter(
      <RecruiterLocationCombobox
        name="targetLocations"
        onChange={() => undefined}
        values={["Greater London"]}
      />,
    );

    expect(html).toContain("Greater London");
    expect(html).toContain("countries, administrative areas, or cities");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('name="targetLocations"');
  });
});

function renderWithRouter(element: React.ReactNode): string {
  const router = createMemoryRouter([{ path: "/", element }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}
