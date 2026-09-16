import { describe, expect, it } from "vitest";
import type { RelationshipPlanAdvisor } from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import { createRecordingAdvisorHistory } from "@/contexts/opportunity-tracking/test-support/recording-advisor-history";
import { createRelationshipPlanComposition } from "./advisor.server";

describe("Opportunity Advisor composition", () => {
  it("plans for an existing Application with its Opportunity and public Prospect evidence", async () => {
    const received: Parameters<RelationshipPlanAdvisor["planRelationship"]>[0][] = [];
    const saved: unknown[] = [];
    const advisor: RelationshipPlanAdvisor = {
      async planRelationship(input) {
        received.push(input);
        return {
          summary: "Use the existing Prospect before looking for another route.",
          prospectReferences: [
            {
              shortlistId: "shortlist-1",
              recruiterId: "recruiter-7",
              reason: "The Prospect recruits for the target function.",
              evidenceUrls: ["https://example.test/evidence/alex"],
            },
          ],
          publicPeople: [],
          recommendations: [],
        };
      },
    };
    const planner = createRelationshipPlanComposition({
      history: createRecordingAdvisorHistory(),
      advisor,
      applications: {
        findById: () => ({ id: 41, searchProfileId: 7, jobListingId: 11 }),
      },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
      opportunities: {
        getOpportunitySnapshot: () => opportunity(),
      },
      plans: {
        latest: () => undefined,
        save: (plan) => saved.push(plan),
      },
      policy,
      publicPeople: () => ({ verify: async () => false }),
      prospects: {
        listProspects: async () => [prospect()],
      },
    });

    const result = await planner.planRelationship(41);

    expect(result).toMatchObject({
      status: "completed",
      plan: {
        applicationId: 41,
        summary: "Use the existing Prospect before looking for another route.",
      },
    });
    expect(received).toEqual([
      {
        applicationId: 41,
        signal: expect.any(AbortSignal),
        opportunity: opportunity(),
        prospects: [prospect()],
        evidenceCutoff: new Date("2026-09-14T12:00:00.000Z"),
        execution: {
          model: "test-model",
          reasoningEffort: "high",
          timeoutMs: 10_000,
          outputLimit: 4_000,
          schemaVersion: 2,
        },
      },
    ]);
    expect(saved).toEqual([result.status === "completed" ? result.plan : null]);
  });

  it("rejects a missing Application before reading Prospects, calling the advisor, or saving", async () => {
    const calls = { advisor: 0, prospects: 0, saves: 0 };
    const planner = createRelationshipPlanComposition({
      history: createRecordingAdvisorHistory(),
      advisor: {
        async planRelationship() {
          calls.advisor += 1;
          throw new Error("should not run");
        },
      },
      applications: { findById: () => undefined },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
      opportunities: { getOpportunitySnapshot: () => opportunity() },
      plans: {
        latest: () => undefined,
        save: () => {
          calls.saves += 1;
        },
      },
      policy,
      publicPeople: () => ({ verify: async () => false }),
      prospects: {
        listProspects: async () => {
          calls.prospects += 1;
          return [prospect()];
        },
      },
    });

    await expect(planner.planRelationship(99)).resolves.toEqual({
      status: "application-not-found",
    });
    expect(calls).toEqual({ advisor: 0, prospects: 0, saves: 0 });
  });
});

it("freezes public-person verification before the agent runs and passes cancellation", async () => {
  const controller = new AbortController();
  let requestLimit = 2;
  let selectedLimit = 0;
  let observedSignal: AbortSignal | undefined;
  const saved: unknown[] = [];
  const person = {
    name: "Alex",
    title: "Recruiter",
    companyName: "Example",
    profileUrl: "https://example.test/alex",
    reason: "Relevant",
    evidence: [{ sourceUrl: "https://example.test/alex", excerpt: "Alex recruits at Example." }],
  };
  const planner = createRelationshipPlanComposition({
    history: createRecordingAdvisorHistory(),
    advisor: {
      planRelationship: async () => {
        requestLimit = 9;
        return {
          summary: "A public path",
          prospectReferences: [],
          publicPeople: [person],
          recommendations: [],
        };
      },
    },
    applications: { findById: () => ({ id: 41, searchProfileId: 7, jobListingId: 11 }) },
    now: () => new Date("2026-09-14T12:00:00Z"),
    opportunities: { getOpportunitySnapshot: opportunity },
    plans: { latest: () => undefined, save: (value) => saved.push(value) },
    policy,
    prospects: { listProspects: async () => [] },
    publicPeople: () => {
      const frozenLimit = requestLimit;
      return {
        verify: async (_people, signal) => {
          selectedLimit = frozenLimit;
          observedSignal = signal;
          controller.abort();
          return false;
        },
      };
    },
  });
  await expect(planner.planRelationship(41, controller.signal)).resolves.toMatchObject({
    status: "failed",
    message: "Advisor request cancelled.",
  });
  expect(selectedLimit).toBe(2);
  expect(observedSignal?.aborted).toBe(true);
  expect(saved).toEqual([]);
});

it("allows a plan without public people when web-search configuration is unavailable", async () => {
  const saved: unknown[] = [];
  const planner = createRelationshipPlanComposition({
    history: createRecordingAdvisorHistory(),
    advisor: {
      planRelationship: async () => ({
        summary: "Review the role",
        prospectReferences: [],
        publicPeople: [],
        recommendations: [],
      }),
    },
    applications: { findById: () => ({ id: 41, searchProfileId: 7, jobListingId: 11 }) },
    now: () => new Date("2026-09-14T12:00:00Z"),
    opportunities: { getOpportunitySnapshot: opportunity },
    plans: { latest: () => undefined, save: (value) => saved.push(value) },
    policy,
    prospects: { listProspects: async () => [] },
    publicPeople: () => {
      throw new Error("Search key unavailable");
    },
  });
  await expect(planner.planRelationship(41)).resolves.toMatchObject({ status: "completed" });
  expect(saved).toHaveLength(1);
});

it("records the shared operation deadline as timed out rather than cancelled", async () => {
  const history = createRecordingAdvisorHistory();
  const planner = createRelationshipPlanComposition({
    history,
    advisor: {
      planRelationship: async ({ signal }) =>
        new Promise((_, reject) => {
          if (!signal) throw new Error("Expected deadline");
          signal.addEventListener("abort", () => reject(signal.reason), { once: true });
        }),
    },
    applications: { findById: () => ({ id: 41, searchProfileId: 7, jobListingId: 11 }) },
    now: () => new Date(),
    opportunities: { getOpportunitySnapshot: opportunity },
    plans: {
      latest: () => undefined,
      save: () => {
        throw new Error("Timed out plan must not save");
      },
    },
    policy: () => ({ ...policy(), timeoutMs: 10 }),
    prospects: { listProspects: async () => [] },
    publicPeople: () => ({ verify: async () => true }),
  });
  await expect(planner.planRelationship(41)).resolves.toMatchObject({
    status: "failed",
    message: "Advisor request timed out.",
  });
  expect(history.finished).toEqual([
    expect.objectContaining({ status: "timed-out", reason: "timed-out" }),
  ]);
});

function opportunity() {
  return {
    searchProfileId: 7,
    jobListingId: 11,
    title: "Engineering Director",
    companyName: "Example",
    locationText: "London",
    canonicalUrl: "https://example.test/jobs/11",
    applyUrl: "https://example.test/jobs/11/apply",
    listingIsActive: true,
    lastSeenAt: new Date("2026-09-14T08:00:00.000Z"),
    matchScore: 91,
    description: "Lead platform engineering across three teams.",
    searchCriteria: {
      titleTerms: ["Engineering Director"],
      locationTerms: ["London"],
      requiredJobTerms: [],
      excludedTitleTerms: [],
      excludedLocationTerms: [],
      excludedDescriptionTerms: [],
      includeRemote: false,
      salaryCurrency: "GBP",
      salaryMin: null,
      salaryMax: null,
    },
    matchReasons: [{ code: "title-match", term: "Engineering Director" }],
    verified: true,
  };
}

function prospect() {
  return {
    shortlistId: "shortlist-1",
    recruiterId: "recruiter-7",
    name: "Alex Morgan",
    title: "Engineering recruiter",
    companyName: "Example Search",
    profileUrl: "https://example.test/recruiters/alex",
    evidenceUrls: ["https://example.test/evidence/alex"],
  };
}

function policy() {
  return {
    enabled: true,
    model: "test-model",
    reasoningEffort: "high",
    timeoutMs: 10_000,
    outputLimit: 4_000,
    policyVersion: 3,
    schemaVersion: 2,
  };
}
