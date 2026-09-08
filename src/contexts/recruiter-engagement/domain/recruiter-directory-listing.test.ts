import { describe, expect, it } from "vitest";
import type { Evidence, FirmObservation, RecruiterObservation } from "./observation";
import {
  createEmptyRecruiterDirectory,
  type RecruiterDirectory,
  reconcileRecruiterDirectory,
  removeDirectoryRecord,
} from "./recruiter-directory";
import { listRecruiterDirectory } from "./recruiter-directory-listing";

const profileHosts = ["linkedin.com/in"];
const observedAt = new Date("2026-08-28T10:00:00.000Z");

describe("recruiter listing", () => {
  it("lists firms with their recruiters and the specialisms the evidence supports", () => {
    const listing = listRecruiterDirectory(seeded(), { profileHosts });

    expect(listing.firms.map((firm) => [firm.name, firm.specialisms])).toEqual([
      ["Acme Search", ["Software engineering"]],
      ["Beacon Talent", ["Hospitality"]],
    ]);
    expect(listing.firms[0]?.recruiters.map((person) => person.name)).toEqual(["Amina Khan"]);
    expect(listing.availableSpecialisms).toEqual(["Hospitality", "Software engineering"]);
  });

  it("narrows the listing to one specialism, keeping only the firms that hold it", () => {
    const listing = listRecruiterDirectory(seeded(), {
      profileHosts,
      specialism: "Hospitality",
    });

    expect(listing.firms.map((firm) => firm.name)).toEqual(["Beacon Talent"]);
    expect(listing.availableSpecialisms).toEqual(["Hospitality", "Software engineering"]);
    /*
     * Acme Search holds the other specialism, so neither it nor Amina Khan belongs in this view.
     * Testing the unassociated list against the filtered firms returned her as a recruiter without
     * a firm and counted her, so filtering the Directory raised its own recruiter count.
     */
    expect(listing.unassociatedRecruiters.map((recruiter) => recruiter.name)).toEqual([]);
    expect(listing.firms.flatMap((firm) => firm.recruiters.map((person) => person.name))).toEqual([
      "Rafael Costa",
    ]);
    expect({ firmCount: listing.firmCount, recruiterCount: listing.recruiterCount }).toEqual({
      firmCount: 1,
      recruiterCount: 1,
    });
  });

  it("still lists a recruiter whose firm the Directory never held", () => {
    const directory = seeded();
    const detached = {
      ...directory,
      recruiters: directory.recruiters.map((recruiter) =>
        recruiter.name === "Amina Khan" ? { ...recruiter, firmId: null } : recruiter,
      ),
    };

    const listing = listRecruiterDirectory(detached, { profileHosts });

    expect(listing.unassociatedRecruiters.map((recruiter) => recruiter.name)).toEqual([
      "Amina Khan",
    ]);
    expect(listing.recruiterCount).toBe(2);
  });

  it("offers a profile action only where the evidence is a personal profile", () => {
    const listing = listRecruiterDirectory(seeded(), { profileHosts });

    expect(listing.firms[0]?.recruiters[0]?.publicProfileUrl).toBe(
      "https://www.linkedin.com/in/amina-khan",
    );
    expect(listing.firms[1]?.recruiters[0]?.publicProfileUrl).toBeNull();
  });

  it("hides removed records by default and marks them when asked for", () => {
    const directory = seeded();
    const acmeId = directory.firms[0]?.id ?? "";
    const removed = removeDirectoryRecord(directory, {
      cascadeRecruiters: true,
      kind: "firm",
      recordId: acmeId,
      removedAt: new Date("2026-08-29T10:00:00.000Z"),
    });

    expect(
      listRecruiterDirectory(removed, { profileHosts }).firms.map((firm) => firm.name),
    ).toEqual(["Beacon Talent"]);
    expect(
      listRecruiterDirectory(removed, { includeRemoved: true, profileHosts }).firms.map((firm) => [
        firm.name,
        firm.removed,
      ]),
    ).toEqual([
      ["Acme Search", true],
      ["Beacon Talent", false],
    ]);
    expect(listRecruiterDirectory(removed, { profileHosts }).removedCount).toBe(2);
  });

  it("counts what the listing holds so the surface does not recount it", () => {
    const listing = listRecruiterDirectory(seeded(), { profileHosts });

    expect(listing.firmCount).toBe(2);
    expect(listing.recruiterCount).toBe(2);
  });

  it("keeps a recruiter whose firm was removed without cascade, listed as unassociated", () => {
    const directory = seeded();
    const acmeId = directory.firms[0]?.id ?? "";
    const removed = removeDirectoryRecord(directory, {
      cascadeRecruiters: false,
      kind: "firm",
      recordId: acmeId,
      removedAt: new Date("2026-08-29T10:00:00.000Z"),
    });

    const listing = listRecruiterDirectory(removed, { profileHosts });

    expect(listing.firms.map((firm) => firm.name)).toEqual(["Beacon Talent"]);
    expect(listing.unassociatedRecruiters.map((person) => person.name)).toEqual(["Amina Khan"]);
  });
});

function seeded(): RecruiterDirectory {
  return reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
    observations: [
      firmObservation(),
      recruiterObservation(),
      firmObservation({
        companyName: "Beacon Talent",
        specialisms: ["Hospitality"],
        websiteUrl: "https://beacon-talent.ae",
      }),
      recruiterObservation({
        companyName: "Beacon Talent",
        evidence: evidenceFor("beacon-talent.ae/team"),
        name: "Rafael Costa",
        profileUrl: "https://beacon-talent.ae/team",
      }),
    ],
    recordedAt: observedAt,
    runId: "run-1",
  });
}

function firmObservation(overrides: Partial<FirmObservation> = {}): FirmObservation {
  return {
    companyName: "Acme Search",
    evidence: evidenceFor("acme-search.ae"),
    industries: ["Financial services"],
    kind: "firm",
    reason: "Hiring software engineering leaders in the UAE.",
    rankingSignals: {
      currentMandatesOrActivity: true,
      namedRecruiterOrTeamEvidence: true,
      scaleOrTrackRecord: true,
      targetMarkets: ["United Arab Emirates"],
    },
    specialisms: ["Software engineering"],
    websiteUrl: "https://acme-search.ae",
    ...overrides,
  };
}

function recruiterObservation(overrides: Partial<RecruiterObservation> = {}): RecruiterObservation {
  return {
    companyName: "Acme Search",
    evidence: evidenceFor("linkedin.com/in/amina-khan"),
    kind: "recruiter",
    name: "Amina Khan",
    profileUrl: "https://www.linkedin.com/in/amina-khan",
    title: "Technology Recruiter",
    ...overrides,
  };
}

function evidenceFor(source: string): Evidence {
  return {
    adapterId: "public-web-search:test:v1",
    confidence: "high",
    excerpt: "Public evidence for the observed record.",
    observedAt: "2026-08-28",
    policyVersion: "1",
    sourceUrl: `https://${source}`,
  };
}
