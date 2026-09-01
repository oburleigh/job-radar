import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { LocationAutocomplete } from "./location-autocomplete";

describe("platform location autocomplete", () => {
  it("renders saved canonical values without shipping a location dataset to the browser", () => {
    const html = renderWithRouter(
      <LocationAutocomplete
        hint="Choose locations."
        initialOptions={[
          {
            countryCode: "AE",
            detail: "City · AE",
            id: "csc:city:32",
            kind: "city",
            label: "Dubai, United Arab Emirates",
            searchTerms: ["Dubai"],
          },
        ]}
        name="targetLocations"
        onChange={() => undefined}
        values={["Dubai, Dubai, United Arab Emirates"]}
      />,
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('name="targetLocations"');
    expect(html).toContain('aria-label="Remove Dubai, United Arab Emirates"');
    expect(html).toContain('placeholder="Add another location"');
    expect(html).not.toContain('role="option"');
    expect(html).not.toContain("Afghanistan");
  });

  it("marks an unresolved saved value as invalid", () => {
    const html = renderWithRouter(
      <LocationAutocomplete
        hint="Choose locations."
        name="targetLocations"
        onChange={() => undefined}
        values={["Unknown saved location"]}
      />,
    );

    expect(html).toContain('data-invalid="true"');
    expect(html).toContain(
      "Replace saved target locations that are not in the location catalogue.",
    );
  });
});

function renderWithRouter(element: React.ReactNode): string {
  const router = createMemoryRouter([{ path: "/", element }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}
