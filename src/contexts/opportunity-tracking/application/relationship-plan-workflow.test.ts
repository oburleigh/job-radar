import { describe, expect, it } from "vitest";
import { createRecordingAdvisorHistory } from "@/contexts/opportunity-tracking/test-support/recording-advisor-history";

describe("Relationship plan workflow", () => {
  it("stores an application-specific plan that references an existing Prospect", async () => {
    const { createRelationshipPlanWorkflow } = await import("./relationship-plan-workflow");
    const saved: unknown[] = [];
    const prospectEvidenceUrl = "https://example.test/evidence/alex";
    const prospect = {
      shortlistId: "shortlist-1",
      recruiterId: "recruiter-7",
      name: "Alex Morgan",
      title: "Engineering recruiter",
      companyName: "Example Search",
      profileUrl: "https://example.test/recruiters/alex",
      evidenceUrls: [prospectEvidenceUrl],
    };
    const workflow = createRelationshipPlanWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: {
        planRelationship: async () => ({
          summary: "Use the existing Prospect before looking for another route.",
          prospectReferences: [
            {
              shortlistId: prospect.shortlistId,
              recruiterId: prospect.recruiterId,
              reason: "The Prospect recruits for the target function.",
              evidenceUrls: [prospectEvidenceUrl],
            },
          ],
          publicPeople: [],
          recommendations: [
            {
              title: "Review the Prospect evidence",
              reason: "Confirm the relationship is relevant before making contact.",
              evidenceUrls: [prospectEvidenceUrl],
            },
          ],
        }),
      },
      plans: { save: (plan) => saved.push(plan) },
      publicPeople: { verify: async () => false },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });

    const result = await workflow.plan({
      applicationId: 41,
      opportunity: opportunity(),
      prospects: [prospect],
      policy: policy(),
    });

    expect(result).toMatchObject({
      status: "completed",
      plan: {
        applicationId: 41,
        model: "test-model",
        policyVersion: 3,
        schemaVersion: 2,
        summary: "Use the existing Prospect before looking for another route.",
      },
    });
    expect(saved).toEqual([result.status === "completed" ? result.plan : null]);
  });

  it.each(["cancelled", "timed-out"] as const)(
    "does not persist a %s Relationship plan",
    async (status) => {
      const { createRelationshipPlanWorkflow } = await import("./relationship-plan-workflow");
      const history = createRecordingAdvisorHistory();
      const saved: unknown[] = [];
      const controller = new AbortController();
      const clock = { now: new Date("2026-09-14T12:00:00.000Z") };
      const workflow = createRelationshipPlanWorkflow({
        history,
        advisor: {
          planRelationship: async () => {
            if (status === "cancelled") controller.abort();
            else clock.now = new Date("2026-09-14T12:00:10.000Z");
            return {
              summary: "No public people found.",
              prospectReferences: [],
              publicPeople: [],
              recommendations: [],
            };
          },
        },
        plans: { save: (record) => saved.push(record) },
        publicPeople: { verify: async () => false },
        now: () => clock.now,
      });
      const result = await workflow.plan({
        applicationId: 41,
        opportunity: opportunity(),
        prospects: [],
        policy: policy(),
        signal: controller.signal,
      });
      expect(result.status).toBe("failed");
      expect(history.finished).toEqual([{ id: 1, status, reason: status, finishedAt: clock.now }]);
      expect(saved).toEqual([]);
    },
  );

  it.each([false, true])(
    "requires independent public-person evidence resolution (%s)",
    async (resolved) => {
      const { createRelationshipPlanWorkflow } = await import("./relationship-plan-workflow");
      const person = {
        name: "Alex Morgan",
        title: "Engineering recruiter",
        companyName: "Example Search",
        profileUrl: "https://example.test/recruiters/alex",
        reason: "Relevant recruiter.",
        evidence: [
          {
            sourceUrl: "https://example.test/recruiters/alex",
            excerpt: "Alex Morgan recruits engineers for Example Search.",
          },
        ],
      };
      const saved: unknown[] = [];
      const checked: unknown[] = [];
      const workflow = createRelationshipPlanWorkflow({
        history: createRecordingAdvisorHistory(),
        advisor: {
          planRelationship: async () => ({
            summary: "Consider this public person.",
            prospectReferences: [],
            publicPeople: [person],
            recommendations: [
              {
                title: "Review the person",
                reason: "Check relevance before contact.",
                evidenceUrls: [person.profileUrl],
              },
            ],
          }),
        },
        plans: { save: (plan) => saved.push(plan) },
        publicPeople: {
          verify: async (people) => {
            checked.push(people);
            return resolved;
          },
        },
        now: () => new Date("2026-09-14T12:00:00.000Z"),
      });
      const result = await workflow.plan({
        applicationId: 41,
        opportunity: opportunity(),
        prospects: [],
        policy: policy(),
      });
      expect(result.status).toBe(resolved ? "completed" : "rejected");
      expect(checked).toEqual([[person]]);
      expect(saved).toHaveLength(resolved ? 1 : 0);
    },
  );

  it.each([
    [
      "a fabricated Prospect",
      {
        summary: "Unsupported Prospect.",
        prospectReferences: [
          {
            shortlistId: "shortlist-1",
            recruiterId: "fabricated-recruiter",
            reason: "No matching Prospect was supplied.",
            evidenceUrls: ["https://example.test/evidence/alex"],
          },
        ],
        publicPeople: [],
        recommendations: [],
      },
    ],
    [
      "an unsupported Recommendation citation",
      {
        summary: "Unsupported Recommendation.",
        prospectReferences: [],
        publicPeople: [],
        recommendations: [
          {
            title: "Contact an unknown person",
            reason: "No supplied evidence supports this.",
            evidenceUrls: ["https://unresolved.example/evidence"],
          },
        ],
      },
    ],
  ])("rejects %s without storing a plan", async (_label, proposal) => {
    const { createRelationshipPlanWorkflow } = await import("./relationship-plan-workflow");
    let saves = 0;
    const prospect = {
      shortlistId: "shortlist-1",
      recruiterId: "recruiter-7",
      name: "Alex Morgan",
      title: "Engineering recruiter",
      companyName: "Example Search",
      profileUrl: "https://example.test/recruiters/alex",
      evidenceUrls: ["https://example.test/evidence/alex"],
    };
    const workflow = createRelationshipPlanWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: { planRelationship: async () => proposal },
      plans: { save: () => (saves += 1) },
      publicPeople: { verify: async () => false },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });

    await expect(
      workflow.plan({
        applicationId: 41,
        opportunity: opportunity(),
        prospects: [prospect],
        policy: policy(),
      }),
    ).resolves.toEqual({ status: "rejected", reason: "unsupported-relationship-reference" });
    expect(saves).toBe(0);
  });
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
