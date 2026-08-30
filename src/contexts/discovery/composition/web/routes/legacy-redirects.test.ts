import { describe, expect, it } from "vitest";
import { loader as recruiterSearchRedirect } from "./legacy-recruiter-search-redirect";
import { loader as runsRedirect } from "./legacy-runs-redirect";
import { loader as sourcesRedirect } from "./legacy-sources-redirect";
import { loader as adapterSettingsRedirect } from "./settings-adapters-index";
import { loader as settingsRedirect } from "./settings-index";

describe("legacy route redirects", () => {
  it.each([
    ["Discovery Runs", runsRedirect, undefined, "/activity"],
    ["Source Coverage", sourcesRedirect, undefined, "/settings/adapters/source-coverage"],
    ["Adapter settings", adapterSettingsRedirect, undefined, "/settings/adapters/source-coverage"],
  ])("redirects %s to its canonical route", async (_label, loader, _request, location) => {
    await expectRedirect(loader(), location);
  });

  it("preserves Recruiter Search selection on the renamed route", async () => {
    await expectRedirect(
      recruiterSearchRedirect({
        request: new Request("http://localhost/recruiter-research?run=run-7"),
      }),
      "/recruiter-search?run=run-7",
    );
  });

  it.each([
    ["ATS selection", "?ats=greenhouse", "/settings/adapters/ats-registry?ats=greenhouse"],
    ["new integration", "?new=1", "/settings/adapters/ats-registry?new=1"],
    ["irrelevant feature selection", "?profile=7&provider=serper", "/settings/opportunities"],
  ])("maps legacy Settings %s to its owning section", async (_label, query, location) => {
    await expectRedirect(
      settingsRedirect({ request: new Request(`http://localhost/settings${query}`) }),
      location,
    );
  });
});

async function expectRedirect(response: Response, location: string): Promise<void> {
  expect(response.status).toBe(302);
  expect(response.headers.get("Location")).toBe(location);
}
