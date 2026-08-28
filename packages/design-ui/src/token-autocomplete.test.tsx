import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { TokenAutocomplete } from "./index";

describe("token autocomplete", () => {
  it("renders a context-neutral multi-value combobox with a hidden form value", () => {
    const html = renderToStaticMarkup(
      <TokenAutocomplete
        label="Markets"
        name="markets"
        onChange={() => undefined}
        options={[
          { label: "Greater London", value: "london" },
          { label: "West Midlands", value: "west-midlands" },
        ]}
        values={["london"]}
      />,
    );

    expect(html).toContain('role="combobox"');
    expect(html).toContain('name="markets"');
    expect(html).toContain('value="london"');
    expect(html).toContain('aria-label="Remove Greater London"');
    expect(html).not.toContain("<select");
  });

  it("accepts consumer-supplied invalid selection guidance", () => {
    const html = renderToStaticMarkup(
      <TokenAutocomplete
        error="Choose a market from the suggestions."
        invalidSelectionMessage="Choose a market from the suggestions."
        label="Markets"
        name="markets"
        onChange={() => undefined}
        options={[]}
        values={[]}
      />,
    );

    expect(html).toContain("Choose a market from the suggestions.");
  });

  it("can keep unavailable visible values out of its canonical form field", () => {
    const html = renderToStaticMarkup(
      <TokenAutocomplete
        includeUnavailableValuesInFormValue={false}
        label="Markets"
        name="markets"
        onChange={() => undefined}
        options={[{ label: "Greater London", value: "london" }]}
        secondaryPlaceholder="Add another market"
        values={["london", "legacy-market"]}
      />,
    );

    expect(html).toContain('name="markets" value="london"');
    expect(html).toContain('aria-label="Remove legacy-market"');
    expect(html).toContain('placeholder="Add another market"');
  });

  it("uses a consumer normalizer for selected values", () => {
    const html = renderToStaticMarkup(
      <TokenAutocomplete
        label="Markets"
        name="markets"
        onChange={() => undefined}
        options={[{ label: "Saint Lucia", value: "Saint Lucia" }]}
        valueNormalizer={(value) =>
          value
            .trim()
            .toLowerCase()
            .replace(/\bsaint\b/g, "st")
        }
        values={["St Lucia"]}
      />,
    );

    expect(html).toContain('aria-label="Remove Saint Lucia"');
    expect(html).not.toContain('aria-label="Remove St Lucia"');
  });

  it("accepts provider search terms without exposing them as labels", () => {
    const html = renderToStaticMarkup(
      <TokenAutocomplete
        label="Locations"
        name="locations"
        onChange={() => undefined}
        options={[
          {
            label: "United Arab Emirates",
            searchTerms: ["UAE", "AE", "ARE"],
            value: "United Arab Emirates",
          },
        ]}
        values={["United Arab Emirates"]}
      />,
    );

    expect(html).toContain('aria-label="Remove United Arab Emirates"');
    expect(html).not.toContain(">UAE<");
  });

  it("exposes asynchronous loading and result status accessibly", () => {
    const html = renderToStaticMarkup(
      <TokenAutocomplete
        busy
        label="Locations"
        name="locations"
        onChange={() => undefined}
        options={[]}
        statusMessage="Searching locations."
        values={[]}
      />,
    );

    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('role="status">Searching locations.</p>');
  });
});
