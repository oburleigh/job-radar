import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { ResearchExecutionSettingsForm } from "./research-execution-settings-form";

describe("research execution settings form", () => {
  it("shows the one supported local adapter and leaves optional execution fields unconfigured", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <ResearchExecutionSettingsForm execution={{ model: null, reasoningEffort: null }} />
        ),
      },
    ]);
    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("Local Codex CLI");
    expect(html).toContain('name="model" value=""');
    expect(html).toContain('name="reasoningEffort" value=""');
    expect(html).toContain("Use Codex account default");
    expect(html).not.toContain("<select");
  });
});
