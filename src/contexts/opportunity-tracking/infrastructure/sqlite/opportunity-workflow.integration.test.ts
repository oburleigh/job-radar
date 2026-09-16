import { readFileSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { afterEach, describe, expect, it } from "vitest";
import { createAdvisorWorkflow } from "@/contexts/opportunity-tracking/application/advisor-workflow";
import {
  type ApplicationRecord,
  createOpportunityWorkflow,
  type StartApplicationResult,
} from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import { createRelationshipPlanWorkflow } from "@/contexts/opportunity-tracking/application/relationship-plan-workflow";
import * as schema from "@/contexts/opportunity-tracking/infrastructure/sqlite/schema";
import { createSqliteAssessmentStore } from "@/contexts/opportunity-tracking/infrastructure/sqlite/sqlite-assessment-store";
import { createSqliteOpportunityStore } from "@/contexts/opportunity-tracking/infrastructure/sqlite/sqlite-opportunity-store";
import { createSqliteRelationshipPlanStore } from "@/contexts/opportunity-tracking/infrastructure/sqlite/sqlite-relationship-plan-store";
import { createSqliteAdvisorHistory } from "./advisor-history";

describe("opportunity pursuit workflow", () => {
  const openDatabases: Database.Database[] = [];

  afterEach(() => {
    for (const sqlite of openDatabases) sqlite.close();
    openDatabases.length = 0;
  });

  it("starts one Application with its timeline and a stage-specific first Next action", () => {
    const sqlite = new Database(":memory:");
    openDatabases.push(sqlite);
    sqlite.pragma("foreign_keys = ON");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("The test schema path was not configured");
    sqlite.exec(readFileSync(schemaPath, "utf8"));
    const database = drizzle(sqlite, { schema });
    const clock = { now: new Date("2026-09-14T08:00:00.000Z") };
    const ranked = new Set(["7:11", "7:12", "8:11"]);
    const workflow = createOpportunityWorkflow({
      now: () => clock.now,
      opportunities: {
        findRankedOpportunity({ searchProfileId, jobListingId }) {
          return ranked.has(`${searchProfileId}:${jobListingId}`)
            ? { searchProfileId, jobListingId }
            : null;
        },
      },
      store: createSqliteOpportunityStore(database),
    });

    const preparing = workflow.startApplication({
      searchProfileId: 7,
      jobListingId: 11,
      stage: "preparing",
    });
    clock.now = new Date("2026-09-14T08:05:00.000Z");
    const repeated = workflow.startApplication({
      searchProfileId: 7,
      jobListingId: 11,
      stage: "applied",
    });
    clock.now = new Date("2026-09-14T09:00:00.000Z");
    const applied = workflow.startApplication({
      searchProfileId: 7,
      jobListingId: 12,
      stage: "applied",
    });
    clock.now = new Date("2026-09-14T09:05:00.000Z");
    const sameListingForAnotherProfile = workflow.startApplication({
      searchProfileId: 8,
      jobListingId: 11,
      stage: "preparing",
    });

    const preparingApplication = applicationFrom(preparing, "created");
    const appliedApplication = applicationFrom(applied, "created");
    const secondProfileApplication = applicationFrom(sameListingForAnotherProfile, "created");
    expect(preparingApplication.stage).toBe("preparing");
    expect(repeated).toEqual({ status: "existing", application: preparingApplication });
    expect(appliedApplication.stage).toBe("applied");
    expect(secondProfileApplication).toMatchObject({
      jobListingId: 11,
      searchProfileId: 8,
      stage: "preparing",
    });

    expect(workflow.listApplications()).toEqual([
      preparingApplication,
      appliedApplication,
      secondProfileApplication,
    ]);
    expect(workflow.listTimeline(preparingApplication.id)).toEqual([
      {
        applicationId: preparingApplication.id,
        id: expect.any(Number),
        kind: "application-started",
        nextActionId: null,
        occurredAt: new Date("2026-09-14T08:00:00.000Z"),
        stage: "preparing",
      },
    ]);
    expect(workflow.listTimeline(appliedApplication.id)).toEqual([
      {
        applicationId: appliedApplication.id,
        id: expect.any(Number),
        kind: "application-started",
        nextActionId: null,
        occurredAt: new Date("2026-09-14T09:00:00.000Z"),
        stage: "applied",
      },
    ]);

    expect(workflow.listTodayActions(new Date("2026-09-14T12:00:00.000Z"))).toEqual([
      {
        applicationId: preparingApplication.id,
        dueAt: null,
        id: expect.any(Number),
        reason: "Application preparation has started.",
        title: "Tailor the application",
      },
      {
        applicationId: appliedApplication.id,
        dueAt: null,
        id: expect.any(Number),
        reason: "The Application was already submitted.",
        title: "Plan a follow-up",
      },
      {
        applicationId: secondProfileApplication.id,
        dueAt: null,
        id: expect.any(Number),
        reason: "Application preparation has started.",
        title: "Tailor the application",
      },
    ]);

    expect(
      workflow.changeApplicationStage({
        applicationId: preparingApplication.id,
        intent: "advance",
        stage: "screening",
      }),
    ).toEqual({ status: "rejected", reason: "invalid-stage-transition" });
    clock.now = new Date("2026-09-14T12:30:00.000Z");
    expect(
      workflow.changeApplicationStage({
        applicationId: preparingApplication.id,
        intent: "advance",
        stage: "applied",
      }),
    ).toEqual({ status: "changed", stage: "applied" });
    clock.now = new Date("2026-09-14T12:45:00.000Z");
    expect(
      workflow.changeApplicationStage({
        applicationId: preparingApplication.id,
        intent: "correction",
        stage: "preparing",
      }),
    ).toEqual({ status: "changed", stage: "preparing" });
    expect(workflow.listTimeline(preparingApplication.id)).toEqual([
      expect.objectContaining({ kind: "application-started", stage: "preparing" }),
      expect.objectContaining({
        kind: "stage-changed",
        occurredAt: new Date("2026-09-14T12:30:00.000Z"),
        stage: "applied",
      }),
      expect.objectContaining({
        kind: "stage-corrected",
        occurredAt: new Date("2026-09-14T12:45:00.000Z"),
        stage: "preparing",
      }),
    ]);
  });

  it("rolls back a stage change when its timeline entry cannot be written", () => {
    const sqlite = new Database(":memory:");
    openDatabases.push(sqlite);
    sqlite.pragma("foreign_keys = ON");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("The test schema path was not configured");
    sqlite.exec(readFileSync(schemaPath, "utf8"));
    const database = drizzle(sqlite, { schema });
    const workflow = createOpportunityWorkflow({
      now: () => new Date("2026-09-14T14:00:00.000Z"),
      opportunities: {
        findRankedOpportunity: ({ searchProfileId, jobListingId }) => ({
          searchProfileId,
          jobListingId,
        }),
      },
      store: createSqliteOpportunityStore(database),
    });
    const started = workflow.startApplication({
      searchProfileId: 9,
      jobListingId: 21,
      stage: "preparing",
    });
    const application = applicationFrom(started, "created");
    sqlite.exec(`
      CREATE TRIGGER force_stage_timeline_failure
      BEFORE INSERT ON application_timeline
      WHEN NEW.kind = 'stage-changed'
      BEGIN
        SELECT RAISE(ABORT, 'forced timeline failure');
      END;
    `);

    expect(() =>
      workflow.changeApplicationStage({
        applicationId: application.id,
        intent: "advance",
        stage: "applied",
      }),
    ).toThrow(/forced timeline failure/);
    expect(workflow.listApplications()).toEqual([application]);
    expect(workflow.listTimeline(application.id)).toHaveLength(1);
  });

  it("persists Next action completion, deferral, dismissal, and reopening in the timeline", () => {
    const sqlite = new Database(":memory:");
    openDatabases.push(sqlite);
    sqlite.pragma("foreign_keys = ON");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("The test schema path was not configured");
    sqlite.exec(readFileSync(schemaPath, "utf8"));
    const database = drizzle(sqlite, { schema });
    const clock = { now: new Date("2026-09-14T14:00:00.000Z") };
    const workflow = createOpportunityWorkflow({
      now: () => clock.now,
      opportunities: {
        findRankedOpportunity: ({ searchProfileId, jobListingId }) => ({
          searchProfileId,
          jobListingId,
        }),
      },
      store: createSqliteOpportunityStore(database),
    });
    const started = workflow.startApplication({
      searchProfileId: 10,
      jobListingId: 31,
      stage: "preparing",
    });
    const application = applicationFrom(started, "created");
    const action = workflow.listTodayActions(clock.now)[0];
    if (!action) throw new Error("Expected the initial Next action");

    expect(
      workflow.changeNextAction({ actionId: action.id, change: { kind: "complete" } }),
    ).toEqual({ status: "changed", state: "completed" });
    expect(workflow.listTodayActions(clock.now)).toEqual([]);
    expect(workflow.changeNextAction({ actionId: action.id, change: { kind: "reopen" } })).toEqual({
      status: "changed",
      state: "open",
    });
    const deferredUntil = new Date("2026-09-18T09:00:00.000Z");
    expect(
      workflow.changeNextAction({
        actionId: action.id,
        change: { kind: "defer", dueAt: deferredUntil },
      }),
    ).toEqual({ status: "changed", state: "deferred" });
    expect(workflow.listTodayActions(clock.now)).toEqual([]);
    expect(workflow.changeNextAction({ actionId: action.id, change: { kind: "reopen" } })).toEqual({
      status: "changed",
      state: "open",
    });
    expect(workflow.listTodayActions(clock.now)[0]?.dueAt).toBeNull();
    expect(workflow.changeNextAction({ actionId: action.id, change: { kind: "dismiss" } })).toEqual(
      {
        status: "changed",
        state: "dismissed",
      },
    );
    expect(workflow.listTimeline(application.id).map((entry) => entry.kind)).toEqual([
      "application-started",
      "next-action-completed",
      "next-action-reopened",
      "next-action-deferred",
      "next-action-reopened",
      "next-action-dismissed",
    ]);
  });

  it("persists Recommendation decisions without letting a proposal change accepted state", async () => {
    const sqlite = new Database(":memory:");
    openDatabases.push(sqlite);
    sqlite.pragma("foreign_keys = ON");
    const schemaPath = process.env.JOB_RADAR_TEST_SCHEMA_SQL;
    if (!schemaPath) throw new Error("The test schema path was not configured");
    sqlite.exec(readFileSync(schemaPath, "utf8"));
    const database = drizzle(sqlite, { schema });
    const clock = { now: new Date("2026-09-14T14:00:00.000Z") };
    const workflow = createOpportunityWorkflow({
      now: () => clock.now,
      opportunities: {
        findRankedOpportunity: ({ searchProfileId, jobListingId }) => ({
          searchProfileId,
          jobListingId,
        }),
      },
      store: createSqliteOpportunityStore(database),
    });
    const started = workflow.startApplication({
      searchProfileId: 10,
      jobListingId: 31,
      stage: "preparing",
    });
    const application = applicationFrom(started, "created");
    const action = workflow.listApplicationActions(application.id)[0];
    if (!action) throw new Error("Expected the initial Next action");
    workflow.changeNextAction({
      actionId: action.id,
      change: { kind: "defer", dueAt: new Date("2026-09-18T09:00:00.000Z") },
    });
    sqlite
      .prepare(
        `INSERT INTO search_profiles (id, name, title_terms, location_terms, excluded_title_terms, excluded_description_terms, created_at, updated_at) VALUES (10, 'Synthetic profile', '[]', '[]', '[]', '[]', 1, 1)`,
      )
      .run();
    for (const [id, score] of [
      [31, 91],
      [32, 47],
    ]) {
      sqlite
        .prepare(
          `INSERT INTO jobs (id, ats_type, dedupe_key, canonical_url, title, locations, first_seen_at, last_seen_at, raw_payload) VALUES (?, 'greenhouse', ?, ?, 'Engineering Director', '[]', 1, 1, '{}')`,
        )
        .run(id, `job-${id}`, `https://example.test/jobs/${id}`);
      sqlite
        .prepare(
          `INSERT INTO job_matches (profile_id, job_id, status, score, reasons, exclusion_reasons, updated_at) VALUES (10, ?, 'matched', ?, ?, '[]', 1)`,
        )
        .run(id, score, JSON.stringify([{ code: "title-match", term: `Role ${id}` }]));
    }
    sqlite
      .prepare(
        `INSERT INTO recruiter_directory_state (key, payload, updated_at) VALUES ('directory', ?, 1)`,
      )
      .run(JSON.stringify({ recruiters: [{ id: "recruiter-1", name: "Alex Morgan" }] }));
    const acceptedState = () => ({
      matches: sqlite
        .prepare("SELECT job_id, score, reasons FROM job_matches ORDER BY job_id")
        .all(),
      directory: sqlite
        .prepare("SELECT key, payload, updated_at FROM recruiter_directory_state ORDER BY key")
        .all(),
      applications: workflow.listApplications(),
      actions: workflow.listApplicationActions(application.id),
      timeline: workflow.listTimeline(application.id),
    });
    const before = acceptedState();
    expect(before.matches).toEqual([
      { job_id: 31, score: 91, reasons: '[{"code":"title-match","term":"Role 31"}]' },
      { job_id: 32, score: 47, reasons: '[{"code":"title-match","term":"Role 32"}]' },
    ]);
    expect(before.directory).toEqual([
      {
        key: "directory",
        payload: '{"recruiters":[{"id":"recruiter-1","name":"Alex Morgan"}]}',
        updated_at: 1,
      },
    ]);
    expect(before.actions).toMatchObject([{ state: "deferred", dueAt: expect.any(Date) }]);
    const opportunity = {
      searchProfileId: 10,
      jobListingId: 31,
      title: "Engineering Director",
      companyName: "Example",
      locationText: "London",
      canonicalUrl: "https://example.test/jobs/31",
      applyUrl: "https://example.test/jobs/31/apply",
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
    const policy = {
      enabled: true,
      model: "test-model",
      reasoningEffort: "high",
      timeoutMs: 10_000,
      outputLimit: 4_000,
      policyVersion: 3,
      schemaVersion: 2,
    };
    const assessments = createSqliteAssessmentStore(database);
    const assessmentWorkflow = createAdvisorWorkflow({
      history: createSqliteAdvisorHistory(database),
      advisor: {
        assess: async () => ({
          summary: {
            text: "Review the Engineering Director role.",
            evidenceUrls: [opportunity.canonicalUrl],
          },
          strengths: [
            { text: "The role title matches.", evidenceUrls: [opportunity.canonicalUrl] },
          ],
          gaps: [],
          evidence: [{ sourceUrl: opportunity.canonicalUrl, excerpt: opportunity.title }],
          recommendations: [
            {
              title: "Review the listing",
              reason: "Confirm scope before applying.",
              evidenceUrls: [opportunity.canonicalUrl],
            },
          ],
        }),
      },
      assessments,
      now: () => clock.now,
    });
    const assessmentResult = await assessmentWorkflow.assess({ opportunity, policy });
    expect(assessmentResult.status).toBe("completed");
    expect(assessments.latest(opportunity)).toMatchObject({
      summary: {
        text: "Review the Engineering Director role.",
        evidenceUrls: [opportunity.canonicalUrl],
      },
    });
    expect(acceptedState()).toEqual(before);
    const proposal = {
      summary: "Use a credible human path.",
      prospectReferences: [],
      publicPeople: [],
      recommendations: [
        {
          title: "Review the public evidence",
          reason: "Confirm the suggested relationship before making contact.",
          evidenceUrls: ["https://example.test/evidence/recruiter"],
        },
        {
          title: "Contact an unrelated person",
          reason: "This proposal should be dismissed.",
          evidenceUrls: ["https://example.test/evidence/unrelated"],
        },
        {
          title: "Keep this proposal for later",
          reason: "Ignoring a Recommendation must not make a decision.",
          evidenceUrls: ["https://example.test/evidence/later"],
        },
      ],
    };
    const plans = createSqliteRelationshipPlanStore(database);
    const planning = createRelationshipPlanWorkflow({
      history: createSqliteAdvisorHistory(database),
      advisor: { planRelationship: async () => proposal },
      plans,
      publicPeople: { verify: async () => false },
      now: () => clock.now,
    });
    const result = await planning.plan({
      applicationId: application.id,
      opportunity,
      policy,
      prospects: [
        {
          shortlistId: "shortlist-1",
          recruiterId: "recruiter-1",
          name: "Alex Morgan",
          title: "Recruiter",
          companyName: "Example",
          profileUrl: "https://example.test/recruiter",
          evidenceUrls: proposal.recommendations.flatMap((item) => item.evidenceUrls),
        },
      ],
    });
    expect(result.status).toBe("completed");
    expect(plans.latest(application.id)).toMatchObject(proposal);
    expect(acceptedState()).toEqual(before);

    const proposed = workflow.listApplicationRecommendations(application.id);
    expect(proposed).toEqual([
      expect.objectContaining({
        acceptedNextActionId: null,
        applicationId: application.id,
        evidenceUrls: ["https://example.test/evidence/recruiter"],
        sourceKind: "relationship-plan",
        state: "proposed",
        title: "Review the public evidence",
      }),
      expect.objectContaining({ state: "proposed", title: "Contact an unrelated person" }),
      expect.objectContaining({ state: "proposed", title: "Keep this proposal for later" }),
    ]);
    const acceptedRecommendation = proposed[0];
    const dismissedRecommendation = proposed[1];
    if (!acceptedRecommendation || !dismissedRecommendation) {
      throw new Error("Expected persisted Recommendations");
    }

    clock.now = new Date("2026-09-14T14:05:00.000Z");
    const dueAt = new Date("2026-09-15T09:00:00.000Z");
    expect(
      workflow.acceptRecommendation({
        applicationId: application.id,
        recommendationId: acceptedRecommendation.id,
        dueAt,
      }),
    ).toMatchObject({
      status: "accepted",
      action: {
        applicationId: application.id,
        dueAt,
        reason: "Confirm the suggested relationship before making contact.",
        state: "open",
        title: "Review the public evidence",
      },
    });

    clock.now = new Date("2026-09-14T14:10:00.000Z");
    expect(
      workflow.dismissRecommendation({
        applicationId: application.id + 1,
        recommendationId: dismissedRecommendation.id,
      }),
    ).toEqual({ status: "recommendation-not-found" });
    expect(
      workflow
        .listApplicationRecommendations(application.id)
        .find((item) => item.id === dismissedRecommendation.id)?.state,
    ).toBe("proposed");
    expect(
      workflow.dismissRecommendation({
        applicationId: application.id,
        recommendationId: dismissedRecommendation.id,
      }),
    ).toEqual({ status: "dismissed" });

    expect(workflow.listApplications()).toEqual([application]);
    expect(workflow.listApplicationActions(application.id)).toHaveLength(2);
    expect(workflow.listApplicationRecommendations(application.id)).toEqual([
      expect.objectContaining({
        acceptedNextActionId: expect.any(Number),
        state: "accepted",
        title: "Review the public evidence",
      }),
      expect.objectContaining({
        acceptedNextActionId: null,
        state: "dismissed",
        title: "Contact an unrelated person",
      }),
      expect.objectContaining({
        acceptedNextActionId: null,
        state: "proposed",
        title: "Keep this proposal for later",
      }),
    ]);
    expect(workflow.listTimeline(application.id).map((entry) => entry.kind)).toEqual([
      "application-started",
      "next-action-deferred",
      "next-action-created",
    ]);
  });
});

function applicationFrom(
  result: StartApplicationResult,
  status: "created" | "existing",
): ApplicationRecord {
  expect(result).toMatchObject({ status });
  if (!("application" in result)) throw new Error(`Expected an ${status} Application`);
  return result.application;
}
