import { describe, expect, it } from "vitest";
import type { Evidence, FirmObservation, RecruiterObservation } from "./observation";
import {
  createEmptyRecruiterDirectory,
  type RecruiterDirectory,
  reconcileRecruiterDirectory,
  removeDirectoryRecord,
} from "./recruiter-directory";
import { listRecruiterRegistry } from "./recruiter-registry";

const profileHosts = ["linkedin.com/in"];
const observedAt = new Date("2026-08-28T10:00:00.000Z");

describe("recruiter registry", () => {
  it("lists firms with their recruiters and the specialisms the evidence supports", () => {
    const registry = listRecruiterRegistry(seeded(), { profileHosts });

    expect(registry.firms.map((firm) => [firm.name, firm.specialisms])).toEqual([
      ["Acme Search", ["Software engineering"]],
      ["Beacon Talent", ["Hospitality"]],
    ]);
    expect(registry.firms[0]?.recruiters.map((person) => person.name)).toEqual(["Amina Khan"]);
    expect(registry.availableSpecialisms).toEqual(["Hospitality", "Software engineering"]);
  });

  it("narrows the registry to one specialism, keeping only the firms that hold it", () => {
    const registry = listRecruiterRegistry(seeded(), {
      profileHosts,
      specialism: "Hospitality",
    });

    expect(registry.firms.map((firm) => firm.name)).toEqual(["Beacon Talent"]);
    expect(registry.availableSpecialisms).toEqual(["Hospitality", "Software engineering"]);
  });

  it("offers a profile action only where the evidence is a personal profile", () => {
    const registry = listRecruiterRegistry(seeded(), { profileHosts });

    expect(registry.firms[0]?.recruiters[0]?.publicProfileUrl).toBe(
      "https://www.linkedin.com/in/amina-khan",
    );
    expect(registry.firms[1]?.recruiters[0]?.publicProfileUrl).toBeNull();
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

    expect(listRecruiterRegistry(removed, { profileHosts }).firms.map((firm) => firm.name)).toEqual(
      ["Beacon Talent"],
    );
    expect(
      listRecruiterRegistry(removed, { includeRemoved: true, profileHosts }).firms.map((firm) => [
        firm.name,
        firm.removed,
      ]),
    ).toEqual([
      ["Acme Search", true],
      ["Beacon Talent", false],
    ]);
    expect(listRecruiterRegistry(removed, { profileHosts }).removedCount).toBe(2);
  });

  it("counts what the registry holds so the surface does not recount it", () => {
    const registry = listRecruiterRegistry(seeded(), { profileHosts });

    expect(registry.firmCount).toBe(2);
    expect(registry.recruiterCount).toBe(2);
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

    const registry = listRecruiterRegistry(removed, { profileHosts });

    expect(registry.firms.map((firm) => firm.name)).toEqual(["Beacon Talent"]);
    expect(registry.unassociatedRecruiters.map((person) => person.name)).toEqual(["Amina Khan"]);
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
