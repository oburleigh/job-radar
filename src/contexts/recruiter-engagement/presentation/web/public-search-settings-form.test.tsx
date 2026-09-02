import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";

import { PublicSearchSettingsForm } from "./public-search-settings-form";

describe("public search settings form", () => {
  it("shows configured provider selection and keeps detailed query policy collapsed", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <PublicSearchSettingsForm
            governsRuns
            providers={[
              { configured: true, label: "Serper.dev", name: "serper" },
              { configured: false, label: "Brave Search", name: "brave" },
            ]}
            settings={{
              currentActivityTerms: ["hiring"],
              excludedHosts: [],
              firmDiscoveryPhrases: ["technology recruitment firm"],
              maxPagesPerQuery: 2,
              namedRecruiterOrTeamTerms: ["team"],
              profileSourceHosts: ["linkedin.com/in"],
              providerName: "serper",
              recruiterRoleTerms: ["recruiter"],
              resultsPerQuery: 10,
              scaleOrTrackRecordTerms: ["global"],
              stageRequestLimit: 40,
            }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain('name="providerName"');
    expect(html).toContain('value="serper" selected=""');
    expect(html).toContain("Brave Search (not configured)");
    expect(html).toContain("<details");
    expect(html).toContain("Query and evidence terms");
    expect(html).not.toContain("Local Codex");
  });

  it("says a run started now does not use these values when it is not the source in force", () => {
    const router = createMemoryRouter([
      {
        path: "/",
        element: (
          <PublicSearchSettingsForm
            governsRuns={false}
            providers={[{ configured: true, label: "Serper.dev", name: "serper" }]}
            settings={{
              currentActivityTerms: ["hiring"],
              excludedHosts: [],
              firmDiscoveryPhrases: ["technology recruitment firm"],
              maxPagesPerQuery: 2,
              namedRecruiterOrTeamTerms: ["team"],
              profileSourceHosts: ["linkedin.com/in"],
              providerName: "serper",
              recruiterRoleTerms: ["recruiter"],
              resultsPerQuery: 10,
              scaleOrTrackRecordTerms: ["global"],
              stageRequestLimit: 40,
            }}
          />
        ),
      },
    ]);

    const html = renderToStaticMarkup(<RouterProvider router={router} />);

    expect(html).toContain("It is not the research source in force");
    expect(html).toContain("a run started now does not use them");
    for (const alias of ["active adapter", "current provider", "selected engine"]) {
      expect(html.toLowerCase()).not.toContain(alias);
    }
    expect(html).toContain('name="providerName"');
  });
});
