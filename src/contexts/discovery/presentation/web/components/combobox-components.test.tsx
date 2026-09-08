import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { CurrencyCombobox } from "./currency-combobox";
import { LocationCombobox } from "./location-combobox";

describe("profile editor comboboxes", () => {
  it("renders an input-backed target-location combobox with removable values", () => {
    const markup = renderWithRouter(
      <LocationCombobox
        id="profile-location-terms"
        name="locationTerms"
        onChange={() => undefined}
        values={["China"]}
      />,
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).toContain('aria-haspopup="listbox"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('name="locationTerms"');
    expect(markup).toContain('aria-label="Remove China"');
    expect(markup).toContain('placeholder="Add another location"');
    expect(markup).not.toContain('role="option"');
  });

  it("keeps saved city locations visible for canonical validation on submission", () => {
    const markup = renderWithRouter(
      <LocationCombobox
        id="profile-location-terms"
        name="locationTerms"
        onChange={() => undefined}
        values={["China", "Dubai"]}
      />,
    );

    expect(markup).toContain('name="locationTerms" value="China\nDubai"');
    expect(markup).not.toContain('name="legacyLocationTerms"');
    expect(markup).toContain('aria-label="Remove Dubai"');
  });

  it("does not server-render localized currency options while the popup is closed", () => {
    const markup = renderWithRouter(
      <CurrencyCombobox name="salaryCurrency" onChange={() => undefined} value="GBP" />,
    );

    expect(markup).toContain('role="combobox"');
    expect(markup).not.toContain('role="listbox"');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).not.toContain('role="option"');
    expect(markup).not.toContain("British Pound");
  });

  it("renders an invalid salary chooser with a field-specific error relation", () => {
    const markup = renderToStaticMarkup(
      <CurrencyCombobox
        error="Salary currency must be a valid ISO 4217 code such as GBP."
        name="salaryCurrency"
        onChange={() => undefined}
        value="ZZZ"
      />,
    );

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("aria-describedby=");
    expect(markup).toContain("Salary currency must be a valid ISO 4217 code such as GBP.");
  });

  it("renders an invalid target-location chooser with a field-specific error relation", () => {
    const markup = renderWithRouter(
      <LocationCombobox
        id="profile-location-terms"
        error="Add at least one target location."
        name="locationTerms"
        onChange={() => undefined}
        values={[]}
      />,
    );

    expect(markup).toContain('aria-invalid="true"');
    expect(markup).toContain("aria-describedby=");
    expect(markup).toContain("Add at least one target location.");
  });
});

function renderWithRouter(element: React.ReactNode): string {
  const router = createMemoryRouter([{ path: "/", element }]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}
