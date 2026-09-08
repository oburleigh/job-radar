import { describe, expect, it } from "vitest";
import type { Evidence, FirmObservation, RecruiterObservation } from "./observation";
import {
  createEmptyRecruiterDirectory,
  type RecruiterDirectory,
  rankRecruiterDirectory,
  reconcileRecruiterDirectory,
  removeDirectoryRecord,
  restoreDirectoryRecord,
} from "./recruiter-directory";
import { createSearchBrief } from "./research-run";

const observedAt = new Date("2026-08-28T10:00:00.000Z");
const removedAt = new Date("2026-08-29T10:00:00.000Z");
const reobservedAt = new Date("2026-08-30T10:00:00.000Z");

describe("recruiter directory removal", () => {
  it("hides a removed firm and its recruiters from the ranked listing by default", () => {
    const directory = seeded();
    const acmeId = firmIdFor(directory, "Acme Search");

    const removed = removeDirectoryRecord(directory, {
      cascadeRecruiters: true,
      kind: "firm",
      recordId: acmeId,
      removedAt,
    });

    expect(ranked(removed).firms.map((firm) => firm.name)).toEqual(["Beacon Talent"]);
    expect(ranked(removed).unassociatedRecruiters).toEqual([]);
    expect(removed.firms).toHaveLength(2);
    expect(removed.evidence.length).toBe(directory.evidence.length);
  });

  it("keeps a removed firm's recruiters when the removal does not cascade", () => {
    const directory = seeded();
    const acmeId = firmIdFor(directory, "Acme Search");

    const removed = removeDirectoryRecord(directory, {
      cascadeRecruiters: false,
      kind: "firm",
      recordId: acmeId,
      removedAt,
    });

    expect(ranked(removed).firms.map((firm) => firm.name)).toEqual(["Beacon Talent"]);
    expect(ranked(removed).unassociatedRecruiters.map((person) => person.name)).toEqual([
      "Amina Khan",
    ]);
  });

  it("removes one recruiter without touching the firm or its colleagues", () => {
    const directory = seeded();
    const aminaId = recruiterIdFor(directory, "Amina Khan");

    const removed = removeDirectoryRecord(directory, {
      kind: "recruiter",
      recordId: aminaId,
      removedAt,
    });

    const listing = ranked(removed);
    expect(listing.firms.map((firm) => firm.name)).toEqual(["Acme Search", "Beacon Talent"]);
    expect(listing.firms.flatMap((firm) => firm.recruiters.map((person) => person.name))).toEqual([
      "Rafael Costa",
    ]);
  });

  it("does not restore a removed firm when a later run observes it again", () => {
    const directory = seeded();
    const acmeId = firmIdFor(directory, "Acme Search");
    const removed = removeDirectoryRecord(directory, {
      cascadeRecruiters: true,
      kind: "firm",
      recordId: acmeId,
      removedAt,
    });

    const reobserved = reconcileRecruiterDirectory(removed, {
      observations: [firmObservation(), recruiterObservation()],
      recordedAt: reobservedAt,
      runId: "run-later",
    });

    expect(ranked(reobserved).firms.map((firm) => firm.name)).toEqual(["Beacon Talent"]);
    expect(reobserved.firms.find((firm) => firm.id === acmeId)?.lastObservedAt.toISOString()).toBe(
      reobservedAt.toISOString(),
    );
  });

  it("shows removed records, marked as removed, when the listing asks for them", () => {
    const directory = seeded();
    const acmeId = firmIdFor(directory, "Acme Search");
    const removed = removeDirectoryRecord(directory, {
      cascadeRecruiters: true,
      kind: "firm",
      recordId: acmeId,
      removedAt,
    });

    const listing = ranked(removed, { includeRemoved: true });

    expect(listing.firms.map((firm) => [firm.name, firm.removed])).toEqual([
      ["Acme Search", true],
      ["Beacon Talent", false],
    ]);
    expect(listing.firms.find((firm) => firm.name === "Acme Search")?.recruiters[0]?.removed).toBe(
      true,
    );
  });

  it("restores a firm together with the recruiters its removal took with it", () => {
    const directory = seeded();
    const acmeId = firmIdFor(directory, "Acme Search");
    const beaconId = firmIdFor(directory, "Beacon Talent");
    const removed = removeDirectoryRecord(
      removeDirectoryRecord(directory, {
        cascadeRecruiters: true,
        kind: "firm",
        recordId: acmeId,
        removedAt,
      }),
      { cascadeRecruiters: true, kind: "firm", recordId: beaconId, removedAt },
    );

    const restored = restoreDirectoryRecord(removed, { kind: "firm", recordId: acmeId });

    const listing = ranked(restored);
    expect(listing.firms.map((firm) => firm.name)).toEqual(["Acme Search"]);
    expect(listing.firms[0]?.recruiters.map((person) => person.name)).toEqual(["Amina Khan"]);
  });

  it("leaves a separately removed recruiter removed when its firm is restored", () => {
    const directory = seeded();
    const acmeId = firmIdFor(directory, "Acme Search");
    const aminaId = recruiterIdFor(directory, "Amina Khan");
    const removed = removeDirectoryRecord(
      removeDirectoryRecord(directory, { kind: "recruiter", recordId: aminaId, removedAt }),
      { cascadeRecruiters: true, kind: "firm", recordId: acmeId, removedAt },
    );

    const restored = restoreDirectoryRecord(removed, { kind: "firm", recordId: acmeId });

    expect(ranked(restored).firms.find((firm) => firm.id === acmeId)?.recruiters).toEqual([]);
  });
});

function seeded(): RecruiterDirectory {
  return reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
    observations: [
      firmObservation(),
      recruiterObservation(),
      firmObservation({ companyName: "Beacon Talent", websiteUrl: "https://beacon-talent.ae" }),
      recruiterObservation({
        companyName: "Beacon Talent",
        name: "Rafael Costa",
        profileUrl: "https://www.linkedin.com/in/rafael-costa",
      }),
    ],
    recordedAt: observedAt,
    runId: "run-1",
  });
}

function ranked(
  directory: RecruiterDirectory,
  options: { readonly includeRemoved?: boolean } = {},
) {
  return rankRecruiterDirectory(directory, {
    asOf: new Date("2026-08-30T12:00:00.000Z"),
    brief: createSearchBrief({
      criteria: {
        industries: ["Financial services"],
        specialisms: ["Software engineering"],
        targetLocations: ["United Arab Emirates"],
      },
      description: "Software engineering leadership",
      firmTarget: 10,
      recruiterTarget: 20,
    }),
    weights: {
      currentMandatesOrActivity: 15,
      evidenceFreshnessAndQuality: 10,
      namedRecruiterOrTeamEvidence: 10,
      recruiterRoleAndSeniority: 15,
      scaleOrTrackRecord: 10,
      specialism: 20,
      targetMarketOperatingDepth: 20,
    },
    ...options,
  });
}

function firmIdFor(directory: RecruiterDirectory, name: string): string {
  const found = directory.firms.find((firm) => firm.name === name);
  if (!found) throw new Error(`The fixture has no firm named ${name}.`);
  return found.id;
}

function recruiterIdFor(directory: RecruiterDirectory, name: string): string {
  const found = directory.recruiters.find((person) => person.name === name);
  if (!found) throw new Error(`The fixture has no recruiter named ${name}.`);
  return found.id;
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
    excerpt: "Public evidence for the observed firm or recruiter.",
    observedAt: "2026-08-28",
    policyVersion: "1",
    sourceUrl: `https://${source}`,
  };
}
