import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RecruiterLocationCombobox } from "./recruiter-location-combobox";

describe("recruiter location combobox", () => {
  it("uses the supplied configured market vocabulary rather than presentation-owned locations", () => {
    const html = renderToStaticMarkup(
      <RecruiterLocationCombobox
        name="targetLocations"
        onChange={() => undefined}
        options={[
          { key: "region:greater-london", label: "Greater London" },
          { key: "region:west-midlands", label: "West Midlands" },
        ]}
        values={["Greater London"]}
      />,
    );

    expect(html).toContain("Greater London");
    expect(html).not.toContain("United Arab Emirates");
    expect(html).toContain('role="combobox"');
    expect(html).toContain('name="targetLocations"');
  });
});
