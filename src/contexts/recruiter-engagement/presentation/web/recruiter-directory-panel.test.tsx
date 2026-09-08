import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryRouter, RouterProvider } from "react-router";
import { describe, expect, it } from "vitest";
import type { RecruiterDirectoryListing } from "@/contexts/recruiter-engagement/domain/recruiter-directory-listing";
import {
  type RecruiterDirectoryFilters,
  RecruiterDirectoryPanel,
} from "./recruiter-directory-panel";

describe("recruiter Directory panel", () => {
  it("names the Directory rather than a registry", () => {
    const html = render(listing());

    expect(html).toContain("Directory");
    expect(html).not.toContain("Registry");
    expect(html).not.toContain("registry");
  });

  it("shows what the Directory holds and offers a profile action only where one exists", () => {
    const html = render(listing());

    expect(html).toContain("Showing 2 firms and 3 recruiters.");
    expect(html).not.toContain("removed from the whole Directory");
    expect(html).toContain("Open Amina Khan on LinkedIn");
    expect(html).toContain("https://www.linkedin.com/in/amina-khan");
    expect(html).not.toContain("Open Rafael Costa on LinkedIn");
    expect(html).toContain("Rafael Costa");
  });

  it("names the firm on the control that opens its removal, and asks nothing until then", () => {
    const html = render(listing());

    expect(html).toContain('aria-label="Remove Acme Search"');
    expect(html).toContain('aria-label="Remove Beacon Talent"');
    // The cascade question lives in the dialog, which is closed until the control is used.
    expect(html).not.toContain("Remove them with the firm");
    expect(html).not.toContain('value="with-recruiters"');
  });

  it("counts one firm and one recruiter in the singular", () => {
    const html = render(
      listing({
        firmCount: 1,
        firms: [
          {
            id: "firm-beacon",
            name: "Beacon Talent",
            recruiters: [],
            removed: false,
            specialisms: ["Hospitality"],
            websiteUrl: "https://beacon-talent.ae",
          },
        ],
        recruiterCount: 1,
        removedCount: 1,
      }),
    );

    expect(html).toContain("Showing 1 firm and 1 recruiter.");
    expect(html).toContain("1 record removed from the whole Directory.");
    expect(html).not.toContain("1 firms");
    expect(html).not.toContain("1 recruiters");
    expect(html).not.toContain("1 records");
  });

  it("offers restoring rather than removing a record that is already removed", () => {
    const html = render(
      listing({
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
    expect(html).not.toContain('aria-label="Remove Acme Search"');
  });

  it("carries the active filters through a removal so the view does not reset", () => {
    const html = render(listing(), { showRemoved: true, specialism: "Software engineering" });

    expect(html).toContain('type="hidden" name="specialism" value="Software engineering"');
    expect(html).toContain('type="hidden" name="showRemoved" value="on"');
  });

  it("does not present a directory-wide removed count as if the filter applied to it", () => {
    const html = render(listing({ firmCount: 1, recruiterCount: 1, removedCount: 14 }), {
      showRemoved: false,
      specialism: "Hospitality",
    });

    // The filtered pair and the Directory-wide total are separate sentences, not one run of numbers.
    expect(html).toContain("Showing 1 firm and 1 recruiter.");
    expect(html).toContain("14 records removed from the whole Directory.");
  });

  it("says why a filtered Directory is empty rather than showing nothing", () => {
    const html = render(
      listing({ firms: [], recruiterCount: 0, firmCount: 0, unassociatedRecruiters: [] }),
      { showRemoved: false, specialism: "Hospitality" },
    );

    expect(html).toContain("No firms in the Directory hold the Hospitality specialism.");
  });

  it("distinguishes removing one recruiter from removing the firm", () => {
    const html = render(listing());

    expect(html).toContain("Remove Amina Khan");
    expect(html).toContain('type="hidden" name="kind" value="recruiter"');
    // A firm removal is a dialog rather than an inline form, so it posts no kind until confirmed.
    expect(html).not.toContain('type="hidden" name="kind" value="firm"');
    expect(html).toContain('aria-label="Remove Acme Search"');
  });
});

function render(
  value: RecruiterDirectoryListing,
  filters: RecruiterDirectoryFilters = { showRemoved: false, specialism: null },
): string {
  const router = createMemoryRouter([
    {
      path: "/",
      element: <RecruiterDirectoryPanel filters={filters} isSubmitting={false} listing={value} />,
    },
  ]);
  return renderToStaticMarkup(<RouterProvider router={router} />);
}

function listing(overrides: Partial<RecruiterDirectoryListing> = {}): RecruiterDirectoryListing {
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
