import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { researchReasoningEfforts } from "@/contexts/recruiter-engagement/domain/research-run";
import { ExecutionSettingsForm } from "./execution-settings-form";

function render(governsRuns = true) {
  const router = createMemoryRouter([
    {
      path: "/",
      element: (
        <ExecutionSettingsForm
          action="/settings/recruiter-search/execution"
          governsRuns={governsRuns}
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

  it("says the Codex CLI runs the research when it is the source in force", () => {
    expect(render(true)).toContain("Codex CLI");
  });

  it("says a run started now does not use these values when it is not the source in force", () => {
    const html = render(false);
    expect(html).toContain("a run started now does not use them");
    expect(html).not.toContain("Codex CLI installed on this machine");
  });

  it("still lets the values be saved when they are not in force, so a switch is prepared", () => {
    const html = render(false);
    expect(html).toContain('name="model"');
    expect(html).not.toContain("disabled");
  });
});
