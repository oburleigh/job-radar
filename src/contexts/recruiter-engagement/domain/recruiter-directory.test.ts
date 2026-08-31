import { describe, expect, it } from "vitest";

import type { Evidence, FirmObservation, RecruiterObservation } from "./observation";
import {
  assessFirmQualification,
  correctDirectoryFact,
  createEmptyRecruiterDirectory,
  rankRecruiterDirectory,
  reconcileRecruiterDirectory,
  resolveIdentityReview,
} from "./recruiter-directory";
import { createSearchBrief } from "./research-run";

const weights = {
  currentMandatesOrActivity: 15,
  evidenceFreshnessAndQuality: 10,
  namedRecruiterOrTeamEvidence: 10,
  recruiterRoleAndSeniority: 15,
  scaleOrTrackRecord: 10,
  specialism: 20,
  targetMarketOperatingDepth: 20,
} as const;

describe("recruiter directory", () => {
  it("reuses canonical firms, recruiters, and evidence across repeated research", () => {
    const first = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm({ websiteUrl: "https://www.acme-search.ae/team" }),
        recruiter({ profileUrl: "https://www.linkedin.com/in/amina-khan/" }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const refreshed = reconcileRecruiterDirectory(first, {
      observations: [
        firm({ websiteUrl: "https://acme-search.ae/consultants" }),
        recruiter({ profileUrl: "https://www.linkedin.com/in/amina-khan?trk=public" }),
      ],
      recordedAt: new Date("2026-08-28T11:00:00.000Z"),
      runId: "run-2",
    });

    expect(activeFirms(refreshed)).toHaveLength(1);
    expect(activeRecruiters(refreshed)).toHaveLength(1);
    expect(refreshed.evidence).toHaveLength(2);
    expect(refreshed.evidence.map((item) => item.runIds)).toEqual([
      ["run-1", "run-2"],
      ["run-1", "run-2"],
    ]);
  });

  it("retains conflicting observed facts without overwriting the canonical record", () => {
    const initial = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [firm(), recruiter()],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const refreshed = reconcileRecruiterDirectory(initial, {
      observations: [
        firm({ companyName: "Acme Executive Search" }),
        recruiter({ title: "Principal Technology Recruiter" }),
      ],
      recordedAt: new Date("2026-08-29T10:00:00.000Z"),
      runId: "run-2",
    });
    const ranked = rankRecruiterDirectory(refreshed, {
      asOf: new Date("2026-08-29T10:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(ranked.firms[0]).toMatchObject({
      name: "Acme Search",
      conflicts: [{ field: "name", values: ["Acme Executive Search", "Acme Search"] }],
    });
    expect(ranked.firms[0]?.recruiters[0]).toMatchObject({
      title: "Technology Recruiter",
      conflicts: [
        {
          field: "title",
          values: ["Principal Technology Recruiter", "Technology Recruiter"],
        },
      ],
    });
    expect(refreshed.evidence).toHaveLength(4);
  });

  it("keeps low-confidence identity matches separate until the user decides", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ websiteUrl: "https://acme-search.com", evidence: evidence("acme-search.com") }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });

    expect(activeFirms(directory)).toHaveLength(2);
    expect(directory.identityReviews).toEqual([
      expect.objectContaining({
        kind: "firm",
        reason: "The firm names match but the public website domains differ.",
        status: "pending",
      }),
    ]);

    const keptSeparate = resolveIdentityReview(directory, {
      decision: "keep-separate",
      decidedAt: new Date("2026-08-28T11:00:00.000Z"),
      reviewId: directory.identityReviews[0]?.id ?? "missing",
    });
    expect(activeFirms(keptSeparate)).toHaveLength(2);
    expect(keptSeparate.identityReviews[0]?.status).toBe("kept-separate");
  });

  it("merges an approved identity match without discarding either record's evidence", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ websiteUrl: "https://acme-search.com", evidence: evidence("acme-search.com") }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const merged = resolveIdentityReview(directory, {
      decision: "merge",
      decidedAt: new Date("2026-08-28T11:00:00.000Z"),
      reviewId: directory.identityReviews[0]?.id ?? "missing",
    });
    const ranked = rankRecruiterDirectory(merged, {
      asOf: new Date("2026-08-28T12:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(activeFirms(merged)).toHaveLength(1);
    expect(merged.evidence).toHaveLength(2);
    expect(ranked.firms).toHaveLength(1);
    expect(ranked.firms[0]?.evidence).toHaveLength(2);
    expect(merged.identityReviews[0]?.status).toBe("merged");
  });

  it("records a user correction while retaining the conflicting observations", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [firm(), firm({ companyName: "Acme Executive Search" })],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const firmId = activeFirms(directory)[0]?.id ?? "missing";
    const corrected = correctDirectoryFact(directory, {
      correctedAt: new Date("2026-08-28T11:00:00.000Z"),
      field: "name",
      kind: "firm",
      recordId: firmId,
      value: "Acme Executive Search",
    });

    expect(activeFirms(corrected)[0]?.name).toBe("Acme Executive Search");
    expect(corrected.corrections).toEqual([
      {
        correctedAt: new Date("2026-08-28T11:00:00.000Z"),
        field: "name",
        kind: "firm",
        previousValue: "Acme Search",
        recordId: firmId,
        value: "Acme Executive Search",
      },
    ]);
    expect(corrected.evidence).toHaveLength(2);
  });

  it("merges a confirmed recruiter identity and retains both profile observations", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        recruiter(),
        recruiter({
          evidence: evidence("linkedin.com/in/amina-khan-alt"),
          profileUrl: "https://www.linkedin.com/in/amina-khan-alt",
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const review = directory.identityReviews[0];

    expect(review).toMatchObject({
      kind: "recruiter",
      reason: "The recruiter name and firm match but the Public profiles differ.",
      status: "pending",
    });
    const merged = resolveIdentityReview(directory, {
      decision: "merge",
      decidedAt: new Date("2026-08-28T11:00:00.000Z"),
      reviewId: review?.id ?? "missing",
    });
    const ranked = rankRecruiterDirectory(merged, {
      asOf: new Date("2026-08-28T12:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(activeRecruiters(merged)).toHaveLength(1);
    expect(ranked.firms[0]?.recruiters[0]?.evidence).toHaveLength(2);
  });

  it("validates identity decisions and treats a repeated decision as idempotent", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ websiteUrl: "https://acme-search.com", evidence: evidence("acme-search.com") }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    expect(() =>
      resolveIdentityReview(directory, {
        decision: "merge",
        decidedAt: new Date("2026-08-28T11:00:00.000Z"),
        reviewId: "missing",
      }),
    ).toThrow("Identity review missing does not exist.");

    const decided = resolveIdentityReview(directory, {
      decision: "keep-separate",
      decidedAt: new Date("2026-08-28T11:00:00.000Z"),
      reviewId: directory.identityReviews[0]?.id ?? "missing",
    });
    expect(
      resolveIdentityReview(decided, {
        decision: "merge",
        decidedAt: new Date("2026-08-28T12:00:00.000Z"),
        reviewId: decided.identityReviews[0]?.id ?? "missing",
      }),
    ).toBe(decided);
  });

  it("changes only the selected identity review and rejects broken review references", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ websiteUrl: "https://acme-search.com", evidence: evidence("acme-search.com") }),
        firm({ websiteUrl: "https://acme-search.org", evidence: evidence("acme-search.org") }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const selectedReview = directory.identityReviews[0];
    const otherReview = directory.identityReviews[1];
    const decided = resolveIdentityReview(directory, {
      decision: "merge",
      decidedAt: new Date("2026-08-28T11:00:00.000Z"),
      reviewId: selectedReview?.id ?? "missing",
    });

    expect(decided.identityReviews).toEqual([
      expect.objectContaining({ id: selectedReview?.id, status: "merged" }),
      expect.objectContaining({ id: otherReview?.id, status: "pending" }),
    ]);
    expect(activeFirms(decided).map((item) => item.websiteUrl)).toEqual([
      "https://acme-search.ae",
      "https://acme-search.org",
    ]);

    for (const field of ["primaryRecordId", "candidateRecordId"] as const) {
      expect(() =>
        resolveIdentityReview(
          {
            ...directory,
            identityReviews: directory.identityReviews.map((review, index) =>
              index === 0 ? { ...review, [field]: "firm:missing.example" } : review,
            ),
          },
          {
            decision: "merge",
            decidedAt: new Date("2026-08-28T11:00:00.000Z"),
            reviewId: selectedReview?.id ?? "missing",
          },
        ),
      ).toThrow("Recruitment firm firm:missing.example does not exist.");
    }
  });

  it("validates corrections and updates recruiter facts without changing identity", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [firm(), recruiter()],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const firmId = directory.firms[0]?.id ?? "missing";
    const recruiterId = directory.recruiters[0]?.id ?? "missing";

    expect(() =>
      correctDirectoryFact(directory, {
        correctedAt: new Date("2026-08-28T11:00:00.000Z"),
        field: "name",
        kind: "firm",
        recordId: firmId,
        value: "   ",
      }),
    ).toThrow("A corrected directory value cannot be empty.");
    expect(() =>
      correctDirectoryFact(directory, {
        correctedAt: new Date("2026-08-28T11:00:00.000Z"),
        field: "title",
        kind: "firm",
        recordId: firmId,
        value: "Executive search",
      }),
    ).toThrow("title is not a recruitment firm field.");
    expect(() =>
      correctDirectoryFact(directory, {
        correctedAt: new Date("2026-08-28T11:00:00.000Z"),
        field: "name",
        kind: "firm",
        recordId: "firm:missing.example",
        value: "Missing",
      }),
    ).toThrow("Recruitment firm firm:missing.example does not exist.");

    const corrected = correctDirectoryFact(directory, {
      correctedAt: new Date("2026-08-28T11:00:00.000Z"),
      field: "title",
      kind: "recruiter",
      recordId: recruiterId,
      value: "Principal Recruiter",
    });
    expect(corrected.recruiters[0]).toMatchObject({
      id: recruiterId,
      title: "Principal Recruiter",
    });
    expect(corrected.corrections[0]).toMatchObject({
      field: "title",
      previousValue: "Technology Recruiter",
      value: "Principal Recruiter",
    });
    expect(
      correctDirectoryFact(corrected, {
        correctedAt: new Date("2026-08-28T12:00:00.000Z"),
        field: "title",
        kind: "recruiter",
        recordId: recruiterId,
        value: "Principal Recruiter",
      }),
    ).toBe(corrected);

    const withWorkEmail = correctDirectoryFact(directory, {
      correctedAt: new Date("2026-08-28T12:00:00.000Z"),
      field: "workEmail",
      kind: "recruiter",
      recordId: recruiterId,
      value: " Amina@Acme-Search.AE ",
    });
    expect(withWorkEmail.recruiters[0]?.workEmail).toBe("amina@acme-search.ae");
    expect(withWorkEmail.corrections[0]?.previousValue).toBeNull();
  });

  it("updates only the requested record and rejects a missing recruiter", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        recruiter(),
        recruiter({
          evidence: evidence("linkedin.com/in/zara-ali"),
          profileUrl: "https://linkedin.com/in/zara-ali",
          name: "Zara Ali",
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const recruiterId = directory.recruiters[0]?.id ?? "missing";
    const corrected = correctDirectoryFact(directory, {
      correctedAt: new Date("2026-08-28T11:00:00.000Z"),
      field: "name",
      kind: "recruiter",
      recordId: recruiterId,
      value: "Amina Al Khan",
    });

    expect(corrected.recruiters.map((item) => item.name)).toEqual(["Amina Al Khan", "Zara Ali"]);
    expect(() =>
      correctDirectoryFact(directory, {
        correctedAt: new Date("2026-08-28T11:00:00.000Z"),
        field: "name",
        kind: "recruiter",
        recordId: "recruiter:linkedin.com/in/missing",
        value: "Missing",
      }),
    ).toThrow("Recruiter recruiter:linkedin.com/in/missing does not exist.");
  });

  it("updates observation dates without changing unrelated records or established firm links", () => {
    const first = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ companyName: "Beta Search", websiteUrl: "https://beta.example" }),
        recruiter(),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const refreshed = reconcileRecruiterDirectory(first, {
      observations: [firm(), recruiter({ companyName: "An observed alias" })],
      recordedAt: new Date("2026-08-29T10:00:00.000Z"),
      runId: "run-2",
    });

    expect(refreshed.firms.map((item) => [item.name, item.lastObservedAt.toISOString()])).toEqual([
      ["Acme Search", "2026-08-29T10:00:00.000Z"],
      ["Beta Search", "2026-08-28T10:00:00.000Z"],
    ]);
    expect(refreshed.recruiters[0]).toMatchObject({
      companyName: "Acme Search",
      firmId: "firm:acme-search.ae",
      lastObservedAt: new Date("2026-08-29T10:00:00.000Z"),
    });
  });

  it("associates an existing unlinked recruiter when its firm is later observed", () => {
    const first = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [recruiter()],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    expect(first.recruiters[0]?.firmId).toBeNull();

    const refreshed = reconcileRecruiterDirectory(first, {
      observations: [firm(), recruiter()],
      recordedAt: new Date("2026-08-29T10:00:00.000Z"),
      runId: "run-2",
    });
    expect(refreshed.recruiters[0]?.firmId).toBe("firm:acme-search.ae");
  });

  it("continues to associate recruiters after the user corrects a firm name", () => {
    const observed = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [firm({ companyName: "Acme Search Ltd" })],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const corrected = correctDirectoryFact(observed, {
      correctedAt: new Date("2026-08-28T11:00:00.000Z"),
      field: "name",
      kind: "firm",
      recordId: "firm:acme-search.ae",
      value: "Acme Search",
    });
    const refreshed = reconcileRecruiterDirectory(corrected, {
      observations: [recruiter({ companyName: "Acme Search Ltd" })],
      recordedAt: new Date("2026-08-29T10:00:00.000Z"),
      runId: "run-2",
    });

    expect(refreshed.recruiters[0]?.firmId).toBe("firm:acme-search.ae");
  });

  it("normalises public identities and equivalent evidence without weakening host boundaries", () => {
    const first = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm({
          evidence: evidence("WWW.ACME-SEARCH.AE/Evidence/"),
          industries: ["Technology", "Financial services"],
          specialisms: ["Data and AI", "Software engineering"],
          websiteUrl: "https://WWW.ACME-SEARCH.AE/team",
        }),
        recruiter({
          evidence: evidence("WWW.LINKEDIN.COM/in/Amina-Khan/"),
          profileUrl: "https://WWW.LINKEDIN.COM/in/Amina-Khan/",
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const refreshed = reconcileRecruiterDirectory(first, {
      observations: [
        firm({
          evidence: evidence("acme-search.ae/evidence"),
          industries: ["Financial services", "Technology"],
          specialisms: ["Software engineering", "Data and AI"],
          websiteUrl: "https://acme-search.ae/consultants",
        }),
        recruiter({
          evidence: evidence("linkedin.com/in/amina-khan"),
          profileUrl: "https://linkedin.com/in/amina-khan?trk=public",
        }),
        firm({ companyName: "Other", websiteUrl: "https://mywww.example" }),
      ],
      recordedAt: new Date("2026-08-28T11:00:00.000Z"),
      runId: "run-2",
    });

    expect(refreshed.firms.map((item) => item.id)).toEqual([
      "firm:acme-search.ae",
      "firm:mywww.example",
    ]);
    expect(refreshed.recruiters[0]?.id).toBe("recruiter:linkedin.com/in/amina-khan");
    expect(refreshed.evidence.filter((item) => item.recordId.includes("acme-search"))).toEqual([
      expect.objectContaining({ runIds: ["run-1", "run-2"] }),
    ]);
  });

  it("does not propose recruiter matches across different firms", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ companyName: "Different Search", websiteUrl: "https://different.example" }),
        recruiter(),
        recruiter({
          companyName: "Different Search",
          evidence: evidence("linkedin.com/in/amina-khan-different"),
          profileUrl: "https://linkedin.com/in/amina-khan-different",
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });

    expect(directory.identityReviews).toEqual([]);
    expect(activeRecruiters(directory)).toHaveLength(2);
  });

  it("does not duplicate identity reviews or evidence when the same result repeats", () => {
    const first = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ websiteUrl: "https://acme-search.com", evidence: evidence("acme-search.com") }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const repeated = reconcileRecruiterDirectory(first, {
      observations: [
        firm({ websiteUrl: "https://acme-search.com", evidence: evidence("acme-search.com") }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });

    expect(repeated.identityReviews).toHaveLength(1);
    expect(repeated.evidence).toHaveLength(2);
    expect(repeated.evidence[1]).toBe(first.evidence[1]);
  });

  it("includes only active recruiters under their canonical firm and sorts equal scores naturally", () => {
    const observed = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        firm({ companyName: "Beta Search", websiteUrl: "https://beta.example" }),
        recruiter({
          evidence: evidence("linkedin.com/in/search-10"),
          profileUrl: "https://linkedin.com/in/search-10",
          name: "Search 10",
        }),
        recruiter({
          evidence: evidence("linkedin.com/in/search-2"),
          profileUrl: "https://linkedin.com/in/search-2",
          name: "Search 2",
        }),
        recruiter({
          companyName: "Beta Search",
          evidence: evidence("linkedin.com/in/beta"),
          profileUrl: "https://linkedin.com/in/beta",
          name: "Beta Recruiter",
        }),
        recruiter({
          companyName: "Unobserved Search",
          evidence: evidence("linkedin.com/in/unlinked"),
          profileUrl: "https://linkedin.com/in/unlinked",
          name: "Unlinked Recruiter",
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const directory = {
      ...observed,
      recruiters: observed.recruiters.map((item) =>
        item.name === "Search 10"
          ? { ...item, mergedInto: observed.recruiters[1]?.id ?? null }
          : item,
      ),
    };
    const ranked = rankRecruiterDirectory(directory, {
      asOf: new Date("2026-08-28T12:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(
      ranked.firms.find((item) => item.name === "Acme Search")?.recruiters.map((item) => item.name),
    ).toEqual(["Search 2"]);
    expect(
      ranked.firms.find((item) => item.name === "Beta Search")?.recruiters.map((item) => item.name),
    ).toEqual(["Beta Recruiter"]);
    expect(ranked.firms.flatMap((item) => item.recruiters).map((item) => item.name)).not.toContain(
      "Unlinked Recruiter",
    );
    expect(ranked.unassociatedRecruiters.map((item) => item.name)).toEqual(["Unlinked Recruiter"]);
  });

  it("retains public work-email evidence and makes its availability visible", () => {
    const initial = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        recruiter({
          workEmail: {
            address: " Amina.Khan@Acme-Search.AE ",
            evidence: evidence("acme-search.ae/team/amina"),
          },
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const refreshed = reconcileRecruiterDirectory(initial, {
      observations: [
        recruiter({
          workEmail: {
            address: "amina@acme-search.ae",
            evidence: evidence("acme-search.ae/contact/amina"),
          },
        }),
      ],
      recordedAt: new Date("2026-08-29T10:00:00.000Z"),
      runId: "run-2",
    });
    const ranked = rankRecruiterDirectory(refreshed, {
      asOf: new Date("2026-08-29T12:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(refreshed.recruiters[0]?.workEmail).toBe("amina.khan@acme-search.ae");
    expect(ranked.firms[0]?.recruiters[0]).toMatchObject({
      conflicts: [
        {
          field: "workEmail",
          values: ["amina.khan@acme-search.ae", "amina@acme-search.ae"],
        },
      ],
      matchReasons: expect.arrayContaining(["A publicly evidenced work email is available."]),
    });
    expect(ranked.firms[0]?.recruiters[0]?.evidence[0]?.observation).toMatchObject({
      workEmail: {
        address: " Amina.Khan@Acme-Search.AE ",
        evidence: expect.objectContaining({ policyVersion: "1" }),
      },
    });
  });

  it("keeps matching work-email identities separate until the user reviews them", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        recruiter({
          workEmail: {
            address: "amina@acme-search.ae",
            evidence: evidence("linkedin.com/in/amina-khan"),
          },
        }),
        recruiter({
          evidence: evidence("linkedin.com/in/a-khan"),
          profileUrl: "https://linkedin.com/in/a-khan",
          name: "A. Khan",
          workEmail: {
            address: "AMINA@ACME-SEARCH.AE",
            evidence: evidence("linkedin.com/in/a-khan"),
          },
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });

    expect(activeRecruiters(directory)).toHaveLength(2);
    expect(directory.identityReviews).toEqual([
      expect.objectContaining({
        kind: "recruiter",
        reason: "The public work email matches but the Public profiles differ.",
        status: "pending",
      }),
    ]);
  });

  it("leaves a directory record with no evidence unranked", () => {
    const directory = {
      ...createEmptyRecruiterDirectory(),
      firms: [
        {
          firstObservedAt: new Date("2026-08-28T10:00:00.000Z"),
          id: "firm:no-evidence.example",
          lastObservedAt: new Date("2026-08-28T10:00:00.000Z"),
          mergedInto: null,
          name: "No Evidence",
          websiteUrl: "https://no-evidence.example",
        },
      ],
    };
    const ranked = rankRecruiterDirectory(directory, {
      asOf: new Date("2026-08-28T12:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(ranked.firms[0]).toMatchObject({ matchReasons: [], score: 0 });
  });

  it("ranks records deterministically and explains scored and unavailable factors", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm(),
        recruiter({ title: "Software Engineering Recruiter" }),
        firm({
          companyName: "General Search",
          evidence: evidence("general.example", {
            confidence: "low",
            observedAt: "2024-01-01",
          }),
          rankingSignals: unavailableFirmRankingSignals(),
          specialisms: ["Executive search"],
          websiteUrl: "https://general.example",
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const ranked = rankRecruiterDirectory(directory, {
      asOf: new Date("2026-08-28T12:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(ranked.firms.map((item) => [item.name, item.score])).toEqual([
      ["Acme Search", 85],
      ["General Search", 1],
    ]);
    expect(ranked.firms[0]?.matchReasons).toEqual(
      expect.arrayContaining([
        "Specialism matches Software engineering.",
        "Current mandates or operating activity are supported by public evidence.",
        "Recent high-confidence evidence contributes 10 points.",
      ]),
    );
    expect(ranked.firms[0]?.rankingContributions).toEqual([
      {
        factor: "specialism",
        points: 20,
        reason: "Specialism matches Software engineering.",
      },
      {
        factor: "targetMarketOperatingDepth",
        points: 20,
        reason: "Target-market operation is supported for United Arab Emirates.",
      },
      {
        factor: "currentMandatesOrActivity",
        points: 15,
        reason: "Current mandates or operating activity are supported by public evidence.",
      },
      {
        factor: "namedRecruiterOrTeamEvidence",
        points: 10,
        reason: "A named recruiter or team is supported by public evidence.",
      },
      {
        factor: "scaleOrTrackRecord",
        points: 10,
        reason: "Scale or track record is supported by public evidence.",
      },
      expect.objectContaining({ factor: "evidenceFreshnessAndQuality", points: 10 }),
    ]);
    expect(ranked.firms[0]?.qualification).toEqual({
      qualified: true,
      reasons: [
        "Specialism matches Software engineering.",
        "Target-market operation is supported for United Arab Emirates.",
        "Current mandates or operating activity are supported by public evidence.",
      ],
      unavailableFactors: [],
    });
    expect(ranked.firms[0]?.unavailableFactors).toEqual([
      "Recruiter role and seniority do not apply to a firm result.",
      "No public contact route is retained for this firm.",
    ]);
    expect(ranked.firms[0]?.recruiters[0]).toMatchObject({
      name: "Amina Khan",
      score: 60,
    });
  });

  it("requires current evidence for market operation, specialism, and operating activity", () => {
    const brief = searchBrief();
    const asOf = new Date("2026-08-28T12:00:00.000Z");

    expect(assessFirmQualification(firm(), brief, asOf)).toMatchObject({
      qualified: true,
      unavailableFactors: [],
    });
    expect(
      assessFirmQualification(
        firm({
          evidence: evidence("acme-search.ae", { observedAt: "2025-08-27" }),
          rankingSignals: {
            ...firm().rankingSignals,
            currentMandatesOrActivity: false,
            targetMarkets: [],
          },
          specialisms: ["Executive search"],
        }),
        brief,
        asOf,
      ),
    ).toEqual({
      qualified: false,
      reasons: [],
      unavailableFactors: [
        "Matching Specialism Evidence is unavailable.",
        "Current target-market operation Evidence is unavailable.",
        "Current mandates or operating activity Evidence is unavailable.",
      ],
    });
    expect(
      assessFirmQualification(
        firm({
          evidence: evidence("acme-search.ae", { observedAt: "2025-08-27" }),
        }),
        brief,
        asOf,
      ),
    ).toMatchObject({
      qualified: false,
      unavailableFactors: [
        "Current target-market operation Evidence is unavailable.",
        "Current mandates or operating activity Evidence is unavailable.",
      ],
    });
  });

  it.each([
    ["2025-08-28", "high", 10, "Recent high-confidence evidence contributes 10 points."],
    ["2025-08-27", "high", 5, "Retained public evidence contributes 5 points."],
    ["2024-08-28", "medium", 3, "Retained public evidence contributes 3 points."],
    ["2024-08-27", "low", 1, "Retained public evidence contributes 1 point."],
  ] as const)(
    "applies the evidence age and confidence boundaries for %s %s evidence",
    (observedAt, confidence, expectedScore, expectedReason) => {
      const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
        observations: [
          firm({
            evidence: evidence("boundary.example", { confidence, observedAt }),
            rankingSignals: unavailableFirmRankingSignals(),
            specialisms: [],
            websiteUrl: "https://boundary.example",
          }),
        ],
        recordedAt: new Date("2026-08-28T10:00:00.000Z"),
        runId: "run-1",
      });
      const ranked = rankRecruiterDirectory(directory, {
        asOf: new Date("2026-08-28T00:00:00.000Z"),
        brief: searchBrief(),
        weights,
      });

      expect(ranked.firms[0]?.score).toBe(expectedScore);
      expect(ranked.firms[0]?.matchReasons).toContain(expectedReason);
    },
  );

  it("matches any configured firm specialism and normalises names for possible identities", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm({ specialisms: ["Executive search", "Software engineering"] }),
        firm({
          companyName: "  ACME   SEARCH ",
          evidence: evidence("acme-search.com"),
          websiteUrl: "https://acme-search.com",
        }),
        recruiter(),
        recruiter({
          companyName: " acme  search ",
          evidence: evidence("linkedin.com/in/amina-alt"),
          profileUrl: "https://linkedin.com/in/amina-alt",
          name: " AMINA   KHAN ",
        }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });
    const ranked = rankRecruiterDirectory(directory, {
      asOf: new Date("2026-08-28T12:00:00.000Z"),
      brief: searchBrief(),
      weights,
    });

    expect(directory.identityReviews.map((item) => item.kind)).toEqual(["firm", "recruiter"]);
    expect(ranked.firms[0]?.matchReasons).toContain("Specialism matches Software engineering.");
  });

  it("uses natural name order when match scores are equal", () => {
    const directory = reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
      observations: [
        firm({ companyName: "Search 10", websiteUrl: "https://search-10.example" }),
        firm({ companyName: "Search 2", websiteUrl: "https://search-2.example" }),
      ],
      recordedAt: new Date("2026-08-28T10:00:00.000Z"),
      runId: "run-1",
    });

    expect(
      rankRecruiterDirectory(directory, {
        asOf: new Date("2026-08-28T12:00:00.000Z"),
        brief: searchBrief(),
        weights,
      }).firms.map((firm) => firm.name),
    ).toEqual(["Search 2", "Search 10"]);
  });
});

function activeFirms(directory: ReturnType<typeof createEmptyRecruiterDirectory>) {
  return directory.firms.filter((item) => item.mergedInto === null);
}

function activeRecruiters(directory: ReturnType<typeof createEmptyRecruiterDirectory>) {
  return directory.recruiters.filter((item) => item.mergedInto === null);
}

function firm(overrides: Partial<FirmObservation> = {}): FirmObservation {
  return {
    companyName: "Acme Search",
    evidence: evidence("acme-search.ae"),
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

function unavailableFirmRankingSignals(): FirmObservation["rankingSignals"] {
  return {
    currentMandatesOrActivity: false,
    namedRecruiterOrTeamEvidence: false,
    scaleOrTrackRecord: false,
    targetMarkets: [],
  };
}

function recruiter(overrides: Partial<RecruiterObservation> = {}): RecruiterObservation {
  return {
    companyName: "Acme Search",
    evidence: evidence("linkedin.com/in/amina-khan"),
    kind: "recruiter",
    profileUrl: "https://www.linkedin.com/in/amina-khan",
    name: "Amina Khan",
    title: "Technology Recruiter",
    ...overrides,
  };
}

function evidence(source: string, overrides: Partial<Evidence> = {}): Evidence {
  return {
    adapterId: "public-web-search:test:v1",
    confidence: "high",
    excerpt: "Public evidence for the observed firm or recruiter.",
    observedAt: "2026-08-28",
    policyVersion: "1",
    sourceUrl: `https://${source}`,
    ...overrides,
  };
}

function searchBrief() {
  return createSearchBrief({
    criteria: {
      industries: ["Financial services"],
      specialisms: ["Software engineering"],
      targetLocations: ["United Arab Emirates"],
    },
    description: "Software engineering leadership",
    firmTarget: 10,
    recruiterTarget: 20,
  });
}
