import { describe, expect, it } from "vitest";
import type { RecruiterDirectoryStore } from "@/contexts/recruiter-engagement/application/directory/port";
import {
  createEmptyRecruiterDirectory,
  type RecruiterDirectory,
  reconcileRecruiterDirectory,
} from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import type { Shortlist } from "@/contexts/recruiter-engagement/domain/shortlist";
import { testEvidence } from "@/contexts/recruiter-engagement/test-support/research-policy-fixtures";
import { createShortlistManagement } from "./manage-shortlists";
import type { ShortlistStore } from "./port";

describe("Shortlist management", () => {
  it("creates a uniquely named Shortlist with an application-generated identity", async () => {
    const shortlists = inMemoryShortlistStore();
    const management = createShortlistManagement({
      createId: () => "shortlist-1",
      directory: emptyDirectoryStore(),
      now: () => new Date("2026-08-30T10:00:00.000Z"),
      shortlists,
    });

    await expect(management.create({ name: " UAE software recruiters " })).resolves.toEqual({
      createdAt: new Date("2026-08-30T10:00:00.000Z"),
      id: "shortlist-1",
      name: "UAE software recruiters",
      prospects: [],
    });
    await expect(management.create({ name: "uae SOFTWARE recruiters" })).rejects.toThrow(
      "A Shortlist named UAE software recruiters already exists.",
    );
    await expect(shortlists.list()).resolves.toHaveLength(1);
  });

  it("adds one Prospect for a canonical Recruiter and lists its evidenced Contact route", async () => {
    const directory = recruiterDirectory();
    const management = createShortlistManagement({
      createId: () => "shortlist-1",
      directory: directoryStore(directory),
      now: () => new Date("2026-08-30T10:00:00.000Z"),
      shortlists: inMemoryShortlistStore(),
    });
    await management.create({ name: "UAE software recruiters" });

    await management.addProspect({
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
      shortlistId: "shortlist-1",
    });
    await management.addProspect({
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
      shortlistId: "shortlist-1",
    });

    await expect(management.list()).resolves.toMatchObject([
      {
        id: "shortlist-1",
        prospects: [
          {
            campaignPreparation: { eligible: true },
            contactRoutes: [{ kind: "work-email", value: "amina@atlas.example" }],
            recruiter: { name: "Amina Khan" },
          },
        ],
      },
    ]);
  });

  it("updates the Prospect contact exclusion used for Campaign preparation", async () => {
    const management = createShortlistManagement({
      createId: () => "shortlist-1",
      directory: directoryStore(recruiterDirectory()),
      now: () => new Date("2026-08-30T10:00:00.000Z"),
      shortlists: inMemoryShortlistStore(),
    });
    await management.create({ name: "UAE software recruiters" });
    await management.addProspect({
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
      shortlistId: "shortlist-1",
    });

    await management.setContactExclusion({
      contactExclusion: "do-not-contact",
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
      shortlistId: "shortlist-1",
    });

    await expect(management.list()).resolves.toMatchObject([
      {
        prospects: [
          {
            campaignPreparation: { eligible: false },
            contactExclusion: "do-not-contact",
          },
        ],
      },
    ]);
  });

  it("removes a Prospect and deletes its empty Shortlist", async () => {
    const management = createShortlistManagement({
      createId: () => "shortlist-1",
      directory: directoryStore(recruiterDirectory()),
      now: () => new Date("2026-08-30T10:00:00.000Z"),
      shortlists: inMemoryShortlistStore(),
    });
    await management.create({ name: "UAE software recruiters" });
    await management.addProspect({
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
      shortlistId: "shortlist-1",
    });

    await management.removeProspect({
      recruiterId: "recruiter:linkedin.com/in/amina-khan",
      shortlistId: "shortlist-1",
    });
    await expect(management.list()).resolves.toMatchObject([{ prospects: [] }]);

    await management.delete({ shortlistId: "shortlist-1" });
    await expect(management.list()).resolves.toEqual([]);
  });
});

function emptyDirectoryStore(): RecruiterDirectoryStore {
  return directoryStore(createEmptyRecruiterDirectory());
}

function directoryStore(directory: RecruiterDirectory): RecruiterDirectoryStore {
  return {
    async load() {
      return directory;
    },
    async save() {},
  };
}

function recruiterDirectory(): RecruiterDirectory {
  return reconcileRecruiterDirectory(createEmptyRecruiterDirectory(), {
    observations: [
      {
        companyName: "Atlas Search",
        evidence: testEvidence("https://atlas.example/evidence"),
        industries: ["Financial services"],
        kind: "firm",
        rankingSignals: {
          currentMandatesOrActivity: true,
          namedRecruiterOrTeamEvidence: true,
          scaleOrTrackRecord: false,
          targetMarkets: ["United Arab Emirates"],
        },
        reason: "Software recruitment",
        specialisms: ["Software engineering"],
        websiteUrl: "https://atlas.example",
      },
      {
        companyName: "Atlas Search",
        evidence: testEvidence("https://www.linkedin.com/in/amina-khan"),
        kind: "recruiter",
        name: "Amina Khan",
        profileUrl: "https://www.linkedin.com/in/amina-khan",
        title: "Software Engineering Recruiter",
        workEmail: {
          address: "amina@atlas.example",
          evidence: testEvidence("https://atlas.example/team/amina"),
        },
      },
    ],
    recordedAt: new Date("2026-08-30T09:00:00.000Z"),
    runId: "run-1",
  });
}

function inMemoryShortlistStore(): ShortlistStore {
  const shortlists = new Map<string, Shortlist>();
  return {
    async delete(shortlistId) {
      shortlists.delete(shortlistId);
    },
    async get(shortlistId) {
      return shortlists.get(shortlistId);
    },
    async list() {
      return [...shortlists.values()];
    },
    async save(shortlist) {
      shortlists.set(shortlist.id, shortlist);
    },
  };
}
