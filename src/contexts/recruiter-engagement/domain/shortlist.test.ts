import { describe, expect, it } from "vitest";
import type { Evidence } from "./observation";
import {
  correctDirectoryFact,
  createEmptyRecruiterDirectory,
  reconcileRecruiterDirectory,
  resolveIdentityReview,
} from "./recruiter-directory";
import {
  addRecruiterToShortlist,
  assessShortlist,
  createShortlist,
  removeProspectFromShortlist,
  setProspectContactExclusion,
} from "./shortlist";

describe("Shortlist", () => {
  it("requires a name", () => {
    expect(() =>
      createShortlist({
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        id: "shortlist-1",
        name: "   ",
      }),
    ).toThrow("A Shortlist name is required.");
  });

  it("contains Recruiters from several recruitment firms once per canonical Recruiter", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firmObservation("Atlas Search", "https://atlas.example"),
        recruiterObservation(
          "Atlas Search",
          "Amina Khan",
          "https://www.linkedin.com/in/amina-khan",
        ),
        firmObservation("Beacon Talent", "https://beacon.example"),
        recruiterObservation(
          "Beacon Talent",
          "Omar Saleh",
          "https://www.linkedin.com/in/omar-saleh",
        ),
      ],
      recordedAt: new Date("2026-08-30T09:00:00.000Z"),
      runId: "run-1",
    });
    const shortlist = createShortlist({
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      id: "shortlist-1",
      name: "UAE software recruiters",
    });
    const withAmina = addRecruiterToShortlist(shortlist, directory, {
      addedAt: new Date("2026-08-30T10:01:00.000Z"),
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
    });
    const withBoth = addRecruiterToShortlist(withAmina, directory, {
      addedAt: new Date("2026-08-30T10:02:00.000Z"),
      recruiterId: "recruiter:linkedin.com/in/omar-saleh",
    });

    const selectedAgain = addRecruiterToShortlist(withBoth, directory, {
      addedAt: new Date("2026-08-30T10:03:00.000Z"),
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
    });

    expect(selectedAgain).toEqual({
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      id: "shortlist-1",
      name: "UAE software recruiters",
      prospects: [
        {
          addedAt: new Date("2026-08-30T10:01:00.000Z"),
          contactExclusion: "none",
          recruiterId: "recruiter:linkedin.com/in/amina-khan",
        },
        {
          addedAt: new Date("2026-08-30T10:02:00.000Z"),
          contactExclusion: "none",
          recruiterId: "recruiter:linkedin.com/in/omar-saleh",
        },
      ],
    });
  });

  it("keeps one Prospect when an Identity review changes the canonical Recruiter", () => {
    const observed = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firmObservation("Atlas Search", "https://atlas.example"),
        recruiterObservation(
          "Atlas Search",
          "Amina Khan",
          "https://www.linkedin.com/in/amina-khan-original",
        ),
        {
          ...recruiterObservation(
            "Atlas Search",
            "Amina Khan",
            "https://www.linkedin.com/in/amina-khan-duplicate",
          ),
          workEmail: {
            address: "amina@atlas.example",
            evidence: testEvidence("https://atlas.example/team/amina"),
          },
        },
      ],
      recordedAt: new Date("2026-08-30T09:00:00.000Z"),
      runId: "run-1",
    });
    const shortlist = addRecruiterToShortlist(
      createShortlist({
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        id: "shortlist-1",
        name: "UAE software recruiters",
      }),
      observed,
      {
        addedAt: new Date("2026-08-30T10:01:00.000Z"),
        recruiterId: "recruiter:linkedin.com/in/amina-khan-duplicate",
      },
    );
    const withBothObservedRecruiters = addRecruiterToShortlist(shortlist, observed, {
      addedAt: new Date("2026-08-30T10:02:00.000Z"),
      recruiterId: "recruiter:linkedin.com/in/amina-khan-original",
    });
    const excludedDuplicate = setProspectContactExclusion(withBothObservedRecruiters, observed, {
      contactExclusion: "do-not-contact",
      recruiterId: "recruiter:linkedin.com/in/amina-khan-duplicate",
    });
    const merged = resolveIdentityReview(observed, {
      decidedAt: new Date("2026-08-30T10:02:00.000Z"),
      decision: "merge",
      reviewId: observed.identityReviews[0]?.id ?? "missing-review",
    });

    const selectedCanonical = addRecruiterToShortlist(excludedDuplicate, merged, {
      addedAt: new Date("2026-08-30T10:03:00.000Z"),
      recruiterId: "recruiter:linkedin.com/in/amina-khan-original",
    });

    expect(assessShortlist(selectedCanonical, merged).prospects).toMatchObject([
      {
        addedAt: new Date("2026-08-30T10:01:00.000Z"),
        contactExclusion: "do-not-contact",
        contactRoutes: [{ kind: "work-email", value: "amina@atlas.example" }],
        recruiterId: "recruiter:linkedin.com/in/amina-khan-original",
      },
    ]);
  });

  it("requires a correction before using conflicting evidenced work Contact routes", () => {
    const firstObservation = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firmObservation("Atlas Search", "https://atlas.example"),
        {
          ...recruiterObservation(
            "Atlas Search",
            "Amina Khan",
            "https://www.linkedin.com/in/amina-khan",
          ),
          workEmail: {
            address: "amina@atlas.example",
            evidence: testEvidence("https://atlas.example/team/amina"),
          },
        },
      ],
      recordedAt: new Date("2026-08-30T09:00:00.000Z"),
      runId: "run-1",
    });
    const conflicted = reconcileRecruiterDirectory(firstObservation, {
      observations: [
        {
          ...recruiterObservation(
            "Atlas Search",
            "Amina Khan",
            "https://www.linkedin.com/in/amina-khan",
          ),
          workEmail: {
            address: "a.khan@atlas.example",
            evidence: testEvidence("https://atlas.example/contact/amina"),
          },
        },
      ],
      recordedAt: new Date("2026-08-30T10:00:00.000Z"),
      runId: "run-2",
    });
    const shortlist = addRecruiterToShortlist(
      createShortlist({
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        id: "shortlist-1",
        name: "UAE software recruiters",
      }),
      conflicted,
      {
        addedAt: new Date("2026-08-30T10:01:00.000Z"),
        recruiterId: "recruiter:linkedin.com/in/amina-khan",
      },
    );

    expect(assessShortlist(shortlist, conflicted).prospects[0]).toMatchObject({
      campaignPreparation: { eligible: false },
      contactRoutes: [],
    });

    const corrected = correctDirectoryFact(conflicted, {
      correctedAt: new Date("2026-08-30T11:00:00.000Z"),
      field: "workEmail",
      kind: "recruiter",
      recordId: "recruiter:linkedin.com/in/amina-khan",
      value: "a.khan@atlas.example",
    });
    expect(assessShortlist(shortlist, corrected).prospects[0]).toMatchObject({
      campaignPreparation: { eligible: true },
      contactRoutes: [{ kind: "work-email", value: "a.khan@atlas.example" }],
    });
  });

  it("allows Campaign preparation only through the current publicly evidenced work Contact route", () => {
    const observed = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firmObservation("Atlas Search", "https://atlas.example"),
        {
          ...recruiterObservation(
            "Atlas Search",
            "Amina Khan",
            "https://www.linkedin.com/in/amina-khan",
          ),
          workEmail: {
            address: "amina@atlas.example",
            evidence: testEvidence("https://atlas.example/team/amina"),
          },
        },
      ],
      recordedAt: new Date("2026-08-30T09:00:00.000Z"),
      runId: "run-1",
    });
    const shortlist = addRecruiterToShortlist(
      createShortlist({
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        id: "shortlist-1",
        name: "UAE software recruiters",
      }),
      observed,
      {
        addedAt: new Date("2026-08-30T10:01:00.000Z"),
        recruiterId: "recruiter:linkedin.com/in/amina-khan",
      },
    );

    expect(assessShortlist(shortlist, observed).prospects[0]).toMatchObject({
      campaignPreparation: { eligible: true },
      contactRoutes: [
        {
          evidence: [
            {
              confidence: "high",
              observedAt: "2026-08-27",
              sourceUrl: "https://atlas.example/team/amina",
            },
          ],
          kind: "work-email",
          value: "amina@atlas.example",
        },
      ],
    });

    const corrected = correctDirectoryFact(observed, {
      correctedAt: new Date("2026-08-30T11:00:00.000Z"),
      field: "workEmail",
      kind: "recruiter",
      recordId: "recruiter:linkedin.com/in/amina-khan",
      value: "amina@unverified.example",
    });

    expect(assessShortlist(shortlist, corrected).prospects[0]).toMatchObject({
      campaignPreparation: {
        eligible: false,
        reasons: ["No current publicly evidenced work Contact route is available."],
      },
      contactRoutes: [],
      evidence: [{ observation: { workEmail: { address: "amina@atlas.example" } } }],
    });
  });

  it("makes Suppression and Do Not Contact explicit exclusions and supports Prospect deletion", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firmObservation("Atlas Search", "https://atlas.example"),
        {
          ...recruiterObservation(
            "Atlas Search",
            "Amina Khan",
            "https://www.linkedin.com/in/amina-khan",
          ),
          workEmail: {
            address: "amina@atlas.example",
            evidence: testEvidence("https://atlas.example/team/amina"),
          },
        },
      ],
      recordedAt: new Date("2026-08-30T09:00:00.000Z"),
      runId: "run-1",
    });
    const shortlist = addRecruiterToShortlist(
      createShortlist({
        createdAt: new Date("2026-08-30T10:00:00.000Z"),
        id: "shortlist-1",
        name: "UAE software recruiters",
      }),
      directory,
      {
        addedAt: new Date("2026-08-30T10:01:00.000Z"),
        recruiterId: "recruiter:linkedin.com/in/amina-khan",
      },
    );

    const suppressed = setProspectContactExclusion(shortlist, directory, {
      contactExclusion: "suppressed",
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
    });
    expect(assessShortlist(suppressed, directory).prospects[0]).toMatchObject({
      campaignPreparation: {
        eligible: false,
        reasons: ["Suppression excludes this Prospect from Campaign preparation."],
      },
      contactExclusion: "suppressed",
    });

    const doNotContact = setProspectContactExclusion(suppressed, directory, {
      contactExclusion: "do-not-contact",
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
    });
    expect(assessShortlist(doNotContact, directory).prospects[0]).toMatchObject({
      campaignPreparation: {
        eligible: false,
        reasons: ["Do Not Contact excludes this Prospect from Campaign preparation."],
      },
      contactExclusion: "do-not-contact",
    });

    expect(
      removeProspectFromShortlist(doNotContact, directory, {
        recruiterId: "recruiter:linkedin.com/in/amina-khan",
      }).prospects,
    ).toEqual([]);
  });
});

function firmObservation(companyName: string, websiteUrl: string) {
  return {
    companyName,
    evidence: testEvidence(`${websiteUrl}/evidence`),
    industries: ["Financial services"],
    kind: "firm" as const,
    reason: "Software recruitment",
    specialisms: ["Software engineering"],
    websiteUrl,
  };
}

function recruiterObservation(companyName: string, name: string, profileUrl: string) {
  return {
    companyName,
    evidence: testEvidence(profileUrl),
    kind: "recruiter" as const,
    name,
    profileUrl,
    title: "Software Engineering Recruiter",
  };
}

function testEvidence(sourceUrl: string): Evidence {
  return {
    adapterId: "test-recruiter-source",
    confidence: "high",
    excerpt: "Public evidence fixture.",
    observedAt: "2026-08-27",
    policyVersion: "1",
    sourceUrl,
  };
}
