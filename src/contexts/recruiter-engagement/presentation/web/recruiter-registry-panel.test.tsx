import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import type { RecruiterRegistry } from "@/contexts/recruiter-engagement/domain/recruiter-registry";
import { type RecruiterRegistryFilters, RecruiterRegistryPanel } from "./recruiter-registry-panel";

describe("recruiter registry panel", () => {
  it("shows what the registry holds and offers a profile action only where one exists", () => {
    const html = render(registry());

    expect(html).toContain("2 firms · 3 recruiters · 0 removed");
    expect(html).toContain("Open Amina Khan on LinkedIn");
    expect(html).toContain("https://www.linkedin.com/in/amina-khan");
    expect(html).not.toContain("Open Rafael Costa on LinkedIn");
    expect(html).toContain("Rafael Costa");
  });

  it("names the firm and its recruiter count before the removal happens", () => {
    const html = render(registry());

    expect(html).toContain("Remove Acme Search. What happens to its 2 recruiters?");
    expect(html).toContain("Remove them with the firm");
    expect(html).toContain("Keep them, without a firm");
    expect(html).toContain('value="with-recruiters"');
    expect(html).toContain('value="firm-only"');
  });

  it("offers restoring rather than removing a record that is already removed", () => {
    const html = render(
      registry({
        firms: [
          {
            id: "firm-acme",
            name: "Acme Search",
            recruiters: [],
            removed: true,
            specialisms: ["Software engineering"],
            websiteUrl: "https://acme-search.ae",
          },
        ],
        unassociatedRecruiters: [],
      }),
      { showRemoved: true, specialism: null },
    );

    expect(html).toContain("Restore Acme Search");
    expect(html).toContain('name="intent" value="restore-directory-record"');
    expect(html).not.toContain("Remove Acme Search. What happens");
  });

  it("carries the active filters through a removal so the view does not reset", () => {
    const html = render(registry(), { showRemoved: true, specialism: "Software engineering" });

    expect(html).toContain('type="hidden" name="specialism" value="Software engineering"');
    expect(html).toContain('type="hidden" name="showRemoved" value="on"');
  });

  it("says why a filtered registry is empty rather than showing nothing", () => {
    const html = render(
      registry({ firms: [], recruiterCount: 0, firmCount: 0, unassociatedRecruiters: [] }),
      { showRemoved: false, specialism: "Hospitality" },
    );

    expect(html).toContain("No firms in the registry hold the Hospitality specialism.");
  });

  it("distinguishes removing one recruiter from removing the firm", () => {
    const html = render(registry());

    expect(html).toContain("Remove Amina Khan");
    expect(html).toContain('type="hidden" name="kind" value="recruiter"');
    expect(html).toContain('type="hidden" name="kind" value="firm"');
  });
});

function render(
  value: RecruiterRegistry,
  filters: RecruiterRegistryFilters = { showRemoved: false, specialism: null },
): string {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <RecruiterRegistryPanel filters={filters} isSubmitting={false} registry={value} />,
    },
  ]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function registry(overrides: Partial<RecruiterRegistry> = {}): RecruiterRegistry {
  return {
    availableSpecialisms: ["Hospitality", "Software engineering"],
    firmCount: 2,
    firms: [
      {
        id: "firm-acme",
        name: "Acme Search",
        recruiters: [
          {
            companyName: "Acme Search",
            id: "recruiter-amina",
            name: "Amina Khan",
            publicProfileUrl: "https://www.linkedin.com/in/amina-khan",
            removed: false,
            title: "Technology Recruiter",
          },
          {
            companyName: "Acme Search",
            id: "recruiter-rafael",
            name: "Rafael Costa",
            publicProfileUrl: null,
            removed: false,
            title: "Hospitality Recruiter",
          },
        ],
        removed: false,
        specialisms: ["Software engineering"],
        websiteUrl: "https://acme-search.ae",
      },
      {
        id: "firm-beacon",
        name: "Beacon Talent",
        recruiters: [],
        removed: false,
        specialisms: ["Hospitality"],
        websiteUrl: "https://beacon-talent.ae",
      },
    ],
    recruiterCount: 3,
    removedCount: 0,
    unassociatedRecruiters: [
      {
        companyName: "Unknown",
        id: "recruiter-sara",
        name: "Sara Idris",
        publicProfileUrl: "https://www.linkedin.com/in/sara-idris",
        removed: false,
        title: "Executive Search Consultant",
      },
    ],
    ...overrides,
  };
}
