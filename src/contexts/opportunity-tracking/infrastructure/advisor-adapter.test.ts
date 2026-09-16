import { describe, expect, it, vi } from "vitest";

import type { CodexRequest } from "@/platform/codex-cli-client";
import { createCodexAdvisor } from "./advisor-adapter";

const input = {
  opportunity: {
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
  },
  evidenceCutoff: new Date("2026-09-14T12:00:00.000Z"),
  execution: {
    model: "test-model",
    reasoningEffort: "high",
    timeoutMs: 10_000,
    outputLimit: 4_000,
    schemaVersion: 1,
  },
};

describe("Codex Advisor adapter", () => {
  it("returns a strict structured assessment from the frozen Opportunity facts", async () => {
    const requests: CodexRequest[] = [];
    const advisor = createCodexAdvisor({
      client: {
        complete: async (request) => {
          requests.push(request);
          return JSON.stringify(requests.length === 1 ? validReply() : { supported: true });
        },
      },
    });

    await expect(advisor.assess(input)).resolves.toEqual(validReply());
    expect(requests).toHaveLength(2);
    expect(requests[0]?.execution).toEqual({
      model: "test-model",
      reasoningEffort: "high",
      stageTimeoutMs: 10_000,
    });
    expect(requests[0]?.instructions).toContain(JSON.stringify(input.opportunity.description));
    expect(requests[0]?.instructions).toContain(JSON.stringify(input.opportunity.searchCriteria));
    expect(requests[1]?.instructions).toContain(JSON.stringify(validReply()));
    expect(requests[1]?.instructions).toContain(JSON.stringify(input.opportunity));
    expect(requests[1]?.execution.model).toBe(input.execution.model);
    expect(requests[1]?.execution.reasoningEffort).toBe(input.execution.reasoningEffort);
    expect(JSON.stringify(requests[0]?.outputSchema)).not.toContain('"format":"uri"');
  });

  it("rejects invented candidate experience even when it cites a genuine listing quote", async () => {
    const proposal = validReply();
    proposal.summary.text = "Your ten years of engineering leadership make you qualified.";
    const complete = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(proposal))
      .mockResolvedValueOnce(JSON.stringify({ supported: false }));
    await expect(createCodexAdvisor({ client: { complete } }).assess(input)).rejects.toThrow(
      /unsupported claims/i,
    );
    expect(complete).toHaveBeenCalledTimes(2);
  });

  it("uses the remaining timeout and propagates cancellation to support checking", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(3_500);
    const signal = new AbortController().signal;
    const complete = vi
      .fn()
      .mockResolvedValueOnce(JSON.stringify(validReply()))
      .mockResolvedValueOnce(JSON.stringify({ supported: true }));
    try {
      await createCodexAdvisor({ client: { complete } }).assess({ ...input, signal });
      expect(complete.mock.calls[1]?.[0]).toMatchObject({
        execution: { stageTimeoutMs: 7_500 },
        signal,
      });
    } finally {
      now.mockRestore();
    }
  });

  it("does not start support checking after the overall timeout", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValueOnce(1_000).mockReturnValueOnce(11_000);
    const complete = vi.fn().mockResolvedValueOnce(JSON.stringify(validReply()));
    try {
      await expect(createCodexAdvisor({ client: { complete } }).assess(input)).rejects.toThrow(
        /timed out/i,
      );
      expect(complete).toHaveBeenCalledTimes(1);
    } finally {
      now.mockRestore();
    }
  });

  it("rejects malformed or oversized support verdicts", async () => {
    for (const verdict of [JSON.stringify({ supported: "true" }), "x".repeat(4_001)]) {
      const complete = vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(validReply()))
        .mockResolvedValueOnce(verdict);
      await expect(createCodexAdvisor({ client: { complete } }).assess(input)).rejects.toThrow();
    }
  });

  it("rejects schema drift, unresolved URLs, and output beyond the frozen limit", async () => {
    for (const reply of [
      { ...validReply(), unexpected: true },
      {
        ...validReply(),
        evidence: [{ sourceUrl: "not-a-url", excerpt: "Engineering Director" }],
      },
      {
        ...validReply(),
        evidence: [{ sourceUrl: "http://example.test/jobs/11", excerpt: "Engineering Director" }],
      },
      { ...validReply(), summary: { text: "   ", evidenceUrls: ["https://example.test/jobs/11"] } },
      {
        ...validReply(),
        strengths: [{ text: "   ", evidenceUrls: ["https://example.test/jobs/11"] }],
      },
      { ...validReply(), gaps: [{ text: "   ", evidenceUrls: ["https://example.test/jobs/11"] }] },
      {
        ...validReply(),
        evidence: [{ sourceUrl: "https://example.test/jobs/11", excerpt: "   " }],
      },
      {
        ...validReply(),
        recommendations: [
          { title: "   ", reason: "A reason", evidenceUrls: ["https://example.test/one"] },
        ],
      },
      {
        ...validReply(),
        recommendations: [
          { title: "A title", reason: "   ", evidenceUrls: ["https://example.test/one"] },
        ],
      },
    ]) {
      const advisor = createCodexAdvisor({
        client: { complete: async () => JSON.stringify(reply) },
      });
      await expect(advisor.assess(input)).rejects.toThrow();
    }

    const oversized = createCodexAdvisor({
      client: { complete: async () => JSON.stringify(validReply()) },
    });
    await expect(
      oversized.assess({ ...input, execution: { ...input.execution, outputLimit: 10 } }),
    ).rejects.toThrow(/output limit/i);
  });

  it("returns a strict Relationship plan from the frozen Application and Prospect evidence", async () => {
    const requests: CodexRequest[] = [];
    const advisor = createCodexAdvisor({
      client: {
        complete: async (request) => {
          requests.push(request);
          return JSON.stringify(validRelationshipPlan());
        },
      },
    });
    const relationshipInput = {
      ...input,
      applicationId: 41,
      prospects: [
        {
          shortlistId: "shortlist-1",
          recruiterId: "recruiter-7",
          name: "Alex Morgan",
          title: "Engineering recruiter",
          companyName: "Example Search",
          profileUrl: "https://example.test/recruiters/alex",
          evidenceUrls: ["https://example.test/evidence/alex"],
        },
      ],
    };

    await expect(advisor.planRelationship(relationshipInput)).resolves.toEqual(
      validRelationshipPlan(),
    );
    expect(requests).toHaveLength(1);
    expect(requests[0]?.instructions).toBe(
      [
        "Prepare an application-specific Relationship plan using only the supplied evidence.",
        "Application: 41",
        "Evidence cutoff: 2026-09-14T12:00:00.000Z",
        `Opportunity: ${JSON.stringify(input.opportunity)}`,
        `Existing Prospects: ${JSON.stringify(relationshipInput.prospects)}`,
        "Reference an existing Prospect only by its supplied Shortlist and Recruiter identities.",
        "A sourced public person must cite their HTTPS profile URL in their Evidence.",
        "Each Recommendation must cite Evidence supplied in this request or returned for a public person.",
        "Do not add anyone to the Directory or change Application or Next action state.",
        "Return only the supplied JSON schema.",
      ].join("\n"),
    );
    expect(requests[0]?.execution).toEqual({
      model: "test-model",
      reasoningEffort: "high",
      stageTimeoutMs: 10_000,
    });
    expect(JSON.stringify(requests[0]?.outputSchema)).not.toContain('"format":"uri"');
  });

  it("rejects malformed Relationship plans and enforces their output limit", async () => {
    const publicPerson = {
      name: "Alex Morgan",
      title: "Engineering recruiter",
      companyName: "Example Search",
      profileUrl: "https://example.test/recruiters/alex",
      reason: "Relevant public evidence.",
      evidence: [
        {
          sourceUrl: "https://example.test/recruiters/alex",
          excerpt: "Engineering recruiter",
        },
      ],
    };
    for (const plan of [
      { ...validRelationshipPlan(), summary: "   " },
      { ...validRelationshipPlan(), publicPeople: [{ ...publicPerson, name: "   " }] },
      { ...validRelationshipPlan(), publicPeople: [{ ...publicPerson, title: "   " }] },
      { ...validRelationshipPlan(), publicPeople: [{ ...publicPerson, companyName: "   " }] },
      { ...validRelationshipPlan(), publicPeople: [{ ...publicPerson, reason: "   " }] },
      { ...validRelationshipPlan(), publicPeople: [{ ...publicPerson, evidence: [] }] },
    ]) {
      const advisor = createCodexAdvisor({
        client: { complete: async () => JSON.stringify(plan) },
      });
      await expect(
        advisor.planRelationship({ ...input, applicationId: 41, prospects: [] }),
      ).rejects.toThrow();
    }

    const reply = JSON.stringify(validRelationshipPlan());
    const advisor = createCodexAdvisor({ client: { complete: async () => reply } });
    await expect(
      advisor.planRelationship({
        ...input,
        applicationId: 41,
        prospects: [],
        execution: { ...input.execution, outputLimit: reply.length - 1 },
      }),
    ).rejects.toThrow(/output limit/i);
    await expect(
      advisor.planRelationship({
        ...input,
        applicationId: 41,
        prospects: [],
        execution: { ...input.execution, outputLimit: reply.length },
      }),
    ).resolves.toEqual(validRelationshipPlan());
  });
});

function validReply() {
  return {
    summary: { text: "Strong title alignment.", evidenceUrls: ["https://example.test/jobs/11"] },
    strengths: [{ text: "The title matches.", evidenceUrls: ["https://example.test/jobs/11"] }],
    gaps: [
      { text: "Reporting line is not stated.", evidenceUrls: ["https://example.test/jobs/11"] },
    ],
    evidence: [
      {
        sourceUrl: "https://example.test/jobs/11",
        excerpt: "Engineering Director",
      },
    ],
    recommendations: [
      {
        title: "Confirm the reporting line",
        reason: "The listing does not state it.",
        evidenceUrls: ["https://example.test/jobs/11"],
      },
    ],
  };
}

function validRelationshipPlan() {
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
    recommendations: [
      {
        title: "Review the Prospect evidence",
        reason: "Confirm relevance before making contact.",
        evidenceUrls: ["https://example.test/evidence/alex"],
      },
    ],
  };
}
