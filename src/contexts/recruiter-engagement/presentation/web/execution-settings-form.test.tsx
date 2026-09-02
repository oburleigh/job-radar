import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { researchReasoningEfforts } from "@/contexts/recruiter-engagement/domain/research-run";
import { ExecutionSettingsForm } from "./execution-settings-form";

function render() {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <ExecutionSettingsForm
          action="/settings/recruiter-search/execution"
          settings={{
            model: "gpt-5.6-sol",
            reasoningEffort: "high",
            stageRequestLimit: 2,
            stageTimeoutMs: 600_000,
          }}
        />
      ),
    },
  ]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

describe("execution settings form", () => {
  it("offers every reasoning effort the domain supports", () => {
    const html = render();
    const offered = [...html.matchAll(/<option value="([^"]+)"/g)].map(([, value]) => value);
    expect(offered).toEqual([...researchReasoningEfforts]);
  });

  it("labels each effort rather than showing its stored value", () => {
    expect(render()).toContain(">Extra high</option>");
  });

  it("states the freezing contract, so removing it cannot pass unnoticed", () => {
    expect(render()).toContain("Each run freezes these values");
  });
});
