import { describe, expect, it } from "vitest";
import type {
  FirmObservation,
  RecruiterObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import { isDirectoryRecordRemoved } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import { createFakeRecruiterDirectoryStore } from "@/contexts/recruiter-engagement/test-support/recruiter-directory-fake";
import { createRecruiterDirectoryMaintenance } from "./maintain-recruiter-directory";

const observedAt = new Date("2026-08-28T10:00:00.000Z");
const removedAt = new Date("2026-08-29T10:00:00.000Z");

describe("recruiter directory maintenance removal", () => {
  it("persists a firm removal and the recruiters it took with it", async () => {
    const { directory, firmId, recruiterId } = await seeded();

    const afterRemoval = await directory.removeRecord({
      cascadeRecruiters: true,
      kind: "firm",
      recordId: firmId,
      removedAt,
    });

    expect(isDirectoryRecordRemoved(afterRemoval, "firm", firmId)).toBe(true);
    expect(isDirectoryRecordRemoved(afterRemoval, "recruiter", recruiterId)).toBe(true);
    const reloaded = await directory.getDirectory();
    expect(reloaded.removals.map((removal) => [removal.kind, removal.removedWithFirmId])).toEqual([
      ["firm", null],
      ["recruiter", firmId],
    ]);
  });

  it("removes a recruiter without removing the firm it belongs to", async () => {
    const { directory, firmId, recruiterId } = await seeded();

    const afterRemoval = await directory.removeRecord({
      kind: "recruiter",
      recordId: recruiterId,
      removedAt,
    });

    expect(isDirectoryRecordRemoved(afterRemoval, "recruiter", recruiterId)).toBe(true);
    expect(isDirectoryRecordRemoved(afterRemoval, "firm", firmId)).toBe(false);
  });

  it("restores a removed record", async () => {
    const { directory, recruiterId } = await seeded();
    await directory.removeRecord({ kind: "recruiter", recordId: recruiterId, removedAt });

    const restored = await directory.restoreRecord({ kind: "recruiter", recordId: recruiterId });

    expect(isDirectoryRecordRemoved(restored, "recruiter", recruiterId)).toBe(false);
    expect((await directory.getDirectory()).removals).toEqual([]);
  });

  it("keeps a removal in place when a later run observes the same records again", async () => {
    const { directory, firmId, recruiterId } = await seeded();
    await directory.removeRecord({
      cascadeRecruiters: true,
      kind: "firm",
      recordId: firmId,
      removedAt,
    });

    const reconciled = await directory.reconcile({
      observations: [firmObservation(), recruiterObservation()],
      recordedAt: new Date("2026-08-30T10:00:00.000Z"),
      runId: "run-2",
    });

    expect(isDirectoryRecordRemoved(reconciled, "firm", firmId)).toBe(true);
    expect(isDirectoryRecordRemoved(reconciled, "recruiter", recruiterId)).toBe(true);
  });
});

async function seeded() {
  const directory = createRecruiterDirectoryMaintenance({
    store: createFakeRecruiterDirectoryStore(),
  });
  const seeded = await directory.reconcile({
    observations: [firmObservation(), recruiterObservation()],
    recordedAt: observedAt,
    runId: "run-1",
  });
  const firmId = seeded.firms[0]?.id;
  const recruiterId = seeded.recruiters[0]?.id;
  if (!firmId || !recruiterId) {
    throw new Error("The fixture did not seed a firm and a recruiter.");
  }
  return { directory, firmId, recruiterId };
}

function firmObservation(): FirmObservation {
  return {
    companyName: "Acme Search",
    evidence: {
      adapterId: "public-web-search:test:v1",
      confidence: "high",
      excerpt: "Public evidence for the observed firm.",
      observedAt: "2026-08-28",
      policyVersion: "1",
      sourceUrl: "https://acme-search.ae",
    },
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
  };
}

function recruiterObservation(): RecruiterObservation {
  return {
    companyName: "Acme Search",
    evidence: {
      adapterId: "public-web-search:test:v1",
      confidence: "high",
      excerpt: "Public evidence for the observed recruiter.",
      observedAt: "2026-08-28",
      policyVersion: "1",
      sourceUrl: "https://www.linkedin.com/in/amina-khan",
    },
    kind: "recruiter",
    name: "Amina Khan",
    profileUrl: "https://www.linkedin.com/in/amina-khan",
    title: "Technology Recruiter",
  };
}
