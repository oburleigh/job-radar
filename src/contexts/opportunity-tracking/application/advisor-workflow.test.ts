import { describe, expect, it } from "vitest";
import { createRecordingAdvisorHistory } from "@/contexts/opportunity-tracking/test-support/recording-advisor-history";

import { createAdvisorWorkflow } from "./advisor-workflow";

describe("Advisor workflow", () => {
  const opportunity = {
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
    matchReasons: [{ code: "title-match" as const, term: "Engineering Director" }],
    verified: true,
  };

  it("assesses listing text and rejects missing details before calling the provider", async () => {
    let calls = 0;
    const saved: unknown[] = [];
    const workflow = createAdvisorWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: {
        assess: async () => {
          calls++;
          return {
            summary: {
              text: "Platform leadership aligns with the search.",
              evidenceUrls: [opportunity.canonicalUrl],
            },
            strengths: [],
            gaps: [],
            recommendations: [],
            evidence: [
              { sourceUrl: opportunity.canonicalUrl, excerpt: "Lead platform engineering" },
            ],
          };
        },
      },
      assessments: { save: (record) => saved.push(record) },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });
    const policy = {
      enabled: true,
      model: "test",
      reasoningEffort: "high",
      timeoutMs: 10000,
      outputLimit: 4000,
      policyVersion: 1,
      schemaVersion: 2,
    };
    await expect(
      workflow.assess({
        opportunity: {
          ...opportunity,
          description: "Lead platform engineering across three teams.",
        },
        policy,
      }),
    ).resolves.toMatchObject({ status: "completed" });
    await expect(
      workflow.assess({ opportunity: { ...opportunity, description: "   " }, policy }),
    ).resolves.toMatchObject({
      status: "failed",
      message:
        "This listing has no job description. Open the original listing and refresh it through Discovery before requesting an assessment.",
    });
    expect(calls).toBe(1);
    expect(saved).toHaveLength(1);
  });

  it("stores a supported assessment without giving the Advisor write authority", async () => {
    const saved: unknown[] = [];
    const workflow = createAdvisorWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: {
        assess: async () => ({
          summary: {
            text: "Strong title alignment with an unverified leadership-scope gap.",
            evidenceUrls: ["https://example.test/jobs/11"],
          },
          strengths: [
            {
              text: "The title matches the target role.",
              evidenceUrls: ["https://example.test/jobs/11"],
            },
          ],
          gaps: [
            {
              text: "The listing does not state the reporting line.",
              evidenceUrls: ["https://example.test/jobs/11"],
            },
          ],
          evidence: [
            {
              sourceUrl: opportunity.canonicalUrl,
              excerpt: "Engineering Director",
            },
          ],
          recommendations: [
            {
              title: "Confirm the reporting line",
              reason: "The listing does not state it.",
              evidenceUrls: [opportunity.canonicalUrl],
            },
          ],
        }),
      },
      assessments: { save: (record) => saved.push(record) },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });

    await expect(
      workflow.assess({
        opportunity,
        policy: {
          enabled: true,
          model: "test-model",
          reasoningEffort: "high",
          timeoutMs: 10_000,
          outputLimit: 4_000,
          policyVersion: 1,
          schemaVersion: 1,
        },
      }),
    ).resolves.toMatchObject({
      status: "completed",
      assessment: { summary: { text: expect.any(String) } },
    });
    expect(saved).toHaveLength(1);
  });

  it("rejects unsupported recommendations without saving an assessment", async () => {
    let saves = 0;
    const workflow = createAdvisorWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: {
        assess: async () => ({
          summary: { text: "Unsupported claim.", evidenceUrls: ["https://example.test/jobs/11"] },
          strengths: [],
          gaps: [],
          evidence: [],
          recommendations: [
            {
              title: "Submit immediately",
              reason: "A source says so.",
              evidenceUrls: ["https://unresolved.example/evidence"],
            },
          ],
        }),
      },
      assessments: { save: () => (saves += 1) },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });

    const result = await workflow.assess({
      opportunity,
      policy: {
        enabled: true,
        model: "test-model",
        reasoningEffort: "high",
        timeoutMs: 10_000,
        outputLimit: 4_000,
        policyVersion: 1,
        schemaVersion: 1,
      },
    });
    expect(result).toEqual({ status: "rejected", reason: "unsupported-evidence-reference" });
    expect(saves).toBe(0);
  });

  it("rejects factual claims with empty Evidence even without Recommendations", async () => {
    const saved: unknown[] = [];
    const workflow = createAdvisorWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: {
        assess: async () => ({
          summary: {
            text: "The candidate has led a team of fifty engineers.",
            evidenceUrls: ["https://example.test/jobs/11"],
          },
          strengths: [
            {
              text: "The candidate has ten years of management experience.",
              evidenceUrls: ["https://example.test/jobs/11"],
            },
          ],
          gaps: [
            {
              text: "The candidate lacks the required certification.",
              evidenceUrls: ["https://example.test/jobs/11"],
            },
          ],
          evidence: [],
          recommendations: [],
        }),
      },
      assessments: { save: (record) => saved.push(record) },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });

    await expect(
      workflow.assess({
        opportunity,
        policy: {
          enabled: true,
          model: "test-model",
          reasoningEffort: "high",
          timeoutMs: 10_000,
          outputLimit: 4_000,
          policyVersion: 1,
          schemaVersion: 1,
        },
      }),
    ).resolves.toEqual({ status: "rejected", reason: "unsupported-evidence-reference" });
    expect(saved).toEqual([]);
  });

  it.each(["summary", "strength", "gap"] as const)(
    "rejects an uncited %s even when another statement cites valid Evidence",
    async (uncited) => {
      const saved: unknown[] = [];
      const statement = (field: string) => ({
        text: `Interpretation for ${field}`,
        evidenceUrls: field === uncited ? [] : [opportunity.canonicalUrl],
      });
      const workflow = createAdvisorWorkflow({
        history: createRecordingAdvisorHistory(),
        advisor: {
          assess: async () => ({
            summary: statement("summary"),
            strengths: [statement("strength")],
            gaps: [statement("gap")],
            evidence: [{ sourceUrl: opportunity.canonicalUrl, excerpt: opportunity.title }],
            recommendations: [],
          }),
        },
        assessments: { save: (record) => saved.push(record) },
        now: () => new Date("2026-09-14T12:00:00.000Z"),
      });
      await expect(
        workflow.assess({
          opportunity,
          policy: {
            enabled: true,
            model: "test-model",
            reasoningEffort: "high",
            timeoutMs: 10_000,
            outputLimit: 4_000,
            policyVersion: 1,
            schemaVersion: 2,
          },
        }),
      ).resolves.toEqual({ status: "rejected", reason: "unsupported-evidence-reference" });
      expect(saved).toEqual([]);
    },
  );

  it("rejects invented candidate Evidence even when it cites the real listing URL", async () => {
    const saved: unknown[] = [];
    const workflow = createAdvisorWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: {
        assess: async () => ({
          summary: {
            text: "Candidate has the certification.",
            evidenceUrls: [opportunity.canonicalUrl],
          },
          strengths: [],
          gaps: [],
          recommendations: [],
          evidence: [
            { sourceUrl: opportunity.canonicalUrl, excerpt: "Candidate is a certified architect." },
          ],
        }),
      },
      assessments: { save: (record) => saved.push(record) },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });
    await expect(
      workflow.assess({
        opportunity,
        policy: {
          enabled: true,
          model: "test-model",
          reasoningEffort: "high",
          timeoutMs: 10_000,
          outputLimit: 4_000,
          policyVersion: 1,
          schemaVersion: 2,
        },
      }),
    ).resolves.toEqual({ status: "rejected", reason: "unsupported-evidence-reference" });
    expect(saved).toEqual([]);
  });

  it("records the running attempt and its failure with frozen policy and timing", async () => {
    const events: unknown[] = [];
    const clock = { now: new Date("2026-09-14T12:00:00.000Z") };
    const workflow = createAdvisorWorkflow({
      advisor: {
        assess: async () => {
          clock.now = new Date("2026-09-14T12:00:03.000Z");
          throw new Error("provider unavailable");
        },
      },
      assessments: {
        save: () => {
          throw new Error("must not save");
        },
      },
      history: {
        start: (record) => {
          events.push(record);
          return 17;
        },
        finish: (record) => events.push(record),
      },
      now: () => clock.now,
    });
    const policy = {
      enabled: true,
      model: "test-model",
      reasoningEffort: "high",
      timeoutMs: 10_000,
      outputLimit: 4_000,
      policyVersion: 1,
      schemaVersion: 2,
    };
    await expect(workflow.assess({ opportunity, policy })).resolves.toMatchObject({
      status: "failed",
    });
    expect(events).toEqual([
      {
        kind: "assessment",
        searchProfileId: 7,
        jobListingId: 11,
        applicationId: null,
        policy,
        startedAt: new Date("2026-09-14T12:00:00.000Z"),
      },
      {
        id: 17,
        status: "failed",
        reason: "advisor-failed",
        finishedAt: new Date("2026-09-14T12:00:03.000Z"),
      },
    ]);
  });

  it.each(["cancelled", "timed-out"] as const)(
    "retains %s and never saves a late reply",
    async (status) => {
      const history = createRecordingAdvisorHistory();
      const saved: unknown[] = [];
      const clock = { now: new Date("2026-09-14T12:00:00.000Z") };
      const controller = new AbortController();
      const workflow = createAdvisorWorkflow({
        history,
        advisor: {
          assess: async () => {
            if (status === "cancelled") controller.abort();
            else clock.now = new Date("2026-09-14T12:00:10.000Z");
            return {
              summary: { text: "Review the role", evidenceUrls: [opportunity.canonicalUrl] },
              strengths: [],
              gaps: [],
              recommendations: [],
              evidence: [{ sourceUrl: opportunity.canonicalUrl, excerpt: opportunity.title }],
            };
          },
        },
        assessments: { save: (record) => saved.push(record) },
        now: () => clock.now,
      });
      const result = await workflow.assess({
        opportunity,
        signal: controller.signal,
        policy: {
          enabled: true,
          model: "test-model",
          reasoningEffort: "high",
          timeoutMs: 10_000,
          outputLimit: 4_000,
          policyVersion: 1,
          schemaVersion: 2,
        },
      });
      expect(result.status).toBe("failed");
      expect(history.finished).toEqual([{ id: 1, status, reason: status, finishedAt: clock.now }]);
      expect(saved).toEqual([]);
    },
  );

  it("retains the request's frozen policy and Opportunity when the caller changes them during execution", async () => {
    const history = createRecordingAdvisorHistory();
    const selectedOpportunity = { ...opportunity };
    const policy = {
      enabled: true,
      model: "test-model",
      reasoningEffort: "high",
      timeoutMs: 10_000,
      outputLimit: 4_000,
      policyVersion: 1,
      schemaVersion: 2,
    };
    const saved: unknown[] = [];
    const workflow = createAdvisorWorkflow({
      history,
      advisor: {
        assess: async () => {
          selectedOpportunity.jobListingId = 999;
          policy.model = "changed-model";
          return {
            summary: { text: "Review the role", evidenceUrls: [opportunity.canonicalUrl] },
            strengths: [],
            gaps: [],
            recommendations: [],
            evidence: [{ sourceUrl: opportunity.canonicalUrl, excerpt: opportunity.title }],
          };
        },
      },
      assessments: { save: (record) => saved.push(record) },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });
    await workflow.assess({ opportunity: selectedOpportunity, policy });
    expect(saved).toEqual([expect.objectContaining({ jobListingId: 11, model: "test-model" })]);
    expect(history.started[0]?.policy.model).toBe("test-model");
  });

  it("keeps deterministic features available when the Advisor is disabled", async () => {
    let calls = 0;
    const workflow = createAdvisorWorkflow({
      history: createRecordingAdvisorHistory(),
      advisor: {
        assess: async () => {
          calls += 1;
          throw new Error("must not run");
        },
      },
      assessments: { save: () => undefined },
      now: () => new Date("2026-09-14T12:00:00.000Z"),
    });

    await expect(
      workflow.assess({
        opportunity,
        policy: {
          enabled: false,
          model: "test-model",
          reasoningEffort: "high",
          timeoutMs: 10_000,
          outputLimit: 4_000,
          policyVersion: 1,
          schemaVersion: 1,
        },
      }),
    ).resolves.toEqual({ status: "disabled" });
    expect(calls).toBe(0);
  });
});
