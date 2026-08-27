import { Button, PageHeader, TextField } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, LoaderCircle, RotateCcw, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { Form, useNavigation, useRevalidator } from "react-router";
import type { TargetLocationOption } from "@/contexts/recruiter-engagement/application/research-runs/target-locations";
import type { ResearchObservation } from "@/contexts/recruiter-engagement/domain/observation";
import type {
  ResearchCoverage,
  ResearchRun,
  ResearchSourceFailure,
} from "@/contexts/recruiter-engagement/domain/research-run";
import type { RecruiterResearchStartField } from "@/contexts/recruiter-engagement/presentation/web/requests/recruiter-research-request";

import "./styles.css";

export type RecruiterResearchRunView = {
  readonly coverage: ResearchCoverage;
  readonly failures: readonly ResearchSourceFailure[];
  readonly observations: readonly ResearchObservation[];
  readonly run: ResearchRun;
};

type RecruiterResearchPageProps = {
  readonly actionError?: {
    readonly field?: RecruiterResearchStartField;
    readonly message: string;
  };
  readonly research?: RecruiterResearchRunView;
  readonly targetLocationOptions: readonly TargetLocationOption[];
};

const activeStatuses = new Set<ResearchRun["status"]>(["pending", "running", "interrupted"]);

export function RecruiterResearchPage({
  actionError,
  research,
  targetLocationOptions,
}: RecruiterResearchPageProps) {
  const navigation = useNavigation();
  const revalidator = useRevalidator();
  const isSubmitting = navigation.state === "submitting";
  const run = research?.run;
  const isActive = run ? activeStatuses.has(run.status) : false;
  const briefError = fieldError(actionError, "brief");
  const targetLocationsError = fieldError(actionError, "targetLocations");
  const specialismsError = fieldError(actionError, "specialisms");
  const industriesError = fieldError(actionError, "industries");
  const recruiterTargetError = fieldError(actionError, "recruiterTarget");
  const brief = run?.brief ?? {
    criteria: {
      industries: ["Financial services", "Technology", "Healthcare", "Retail and e-commerce"],
      specialisms: [
        "Software engineering",
        "Data and AI",
        "Cloud and DevOps",
        "Cybersecurity",
        "Product",
        "Architecture",
        "Technology leadership",
      ],
      targetLocations: ["United Arab Emirates"],
    },
    description:
      "Research UAE technology recruitment firms for software engineering, data and AI, cloud and DevOps, cybersecurity, product, architecture, and technology leadership roles.",
    recruiterTarget: 20,
  };
  const [briefDescription, setBriefDescription] = useState(brief.description);

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const timer = window.setInterval(() => revalidator.revalidate(), 400);
    return () => window.clearInterval(timer);
  }, [isActive, revalidator]);

  useEffect(() => {
    setBriefDescription(brief.description);
  }, [brief.description]);

  return (
    <div className="page recruiter-research-page">
      <PageHeader
        index="05"
        title="Recruiter research"
        description="Run a local, public-source scan of UAE technology recruitment firms and their named recruiters. Counts describe this run, not the whole market."
      />

      <section className="panel recruiter-brief-panel" aria-labelledby="recruiter-brief-title">
        <div className="recruiter-panel-heading">
          <div>
            <span className="recruiter-kicker">Local research brief</span>
            <h2 id="recruiter-brief-title">Set the market focus</h2>
          </div>
          <span>Public web only</span>
        </div>
        <Form
          key={run?.id ?? "new-research"}
          method="post"
          className="recruiter-brief-form"
          noValidate
        >
          <input name="intent" type="hidden" value="start" />
          <label className="recruiter-textarea-label" htmlFor="recruiter-brief">
            <span>Technology brief</span>
            <textarea
              value={briefDescription}
              disabled={isSubmitting || isActive}
              {...textareaAccessibility("recruiter-brief", briefError, true)}
              id="recruiter-brief"
              maxLength={1000}
              name="brief"
              onChange={(event) => setBriefDescription(event.target.value)}
              rows={5}
            />
            <small id="recruiter-brief-hint">
              Industries in this brief guide prioritisation. Without one, the scan covers major UAE
              technology-hiring sectors.
            </small>
            {briefError ? (
              <small className="jr-field-error" id="recruiter-brief-error">
                {briefError}
              </small>
            ) : null}
          </label>
          <label className="recruiter-target-locations-label" htmlFor="recruiter-target-locations">
            <span>Target locations</span>
            <select
              defaultValue={brief.criteria.targetLocations}
              disabled={isSubmitting || isActive}
              {...selectAccessibility("recruiter-target-locations", targetLocationsError)}
              id="recruiter-target-locations"
              multiple
              name="targetLocations"
              required
              size={targetLocationOptions.length}
            >
              {targetLocationOptions.map((location) => (
                <option key={location.key} value={location.label}>
                  {location.label}
                </option>
              ))}
            </select>
            <small id="recruiter-target-locations-hint">
              Choose one or more configured markets for both research stages.
            </small>
            {targetLocationsError ? (
              <small className="jr-field-error" id="recruiter-target-locations-error">
                {targetLocationsError}
              </small>
            ) : null}
          </label>
          <label className="recruiter-textarea-label" htmlFor="recruiter-specialisms">
            <span>Technology specialisms</span>
            <textarea
              defaultValue={brief.criteria.specialisms.join(", ")}
              disabled={isSubmitting || isActive}
              {...textareaAccessibility("recruiter-specialisms", specialismsError, true)}
              id="recruiter-specialisms"
              name="specialisms"
              rows={3}
            />
            <small id="recruiter-specialisms-hint">
              Separate disciplines with commas or new lines.
            </small>
            {specialismsError ? (
              <small className="jr-field-error" id="recruiter-specialisms-error">
                {specialismsError}
              </small>
            ) : null}
          </label>
          <label className="recruiter-textarea-label" htmlFor="recruiter-industries">
            <span>Target industries</span>
            <textarea
              defaultValue={brief.criteria.industries.join(", ")}
              disabled={isSubmitting || isActive}
              {...textareaAccessibility("recruiter-industries", industriesError, true)}
              id="recruiter-industries"
              name="industries"
              rows={3}
            />
            <small id="recruiter-industries-hint">
              These structured criteria are sent to both research stages.
            </small>
            {industriesError ? (
              <small className="jr-field-error" id="recruiter-industries-error">
                {industriesError}
              </small>
            ) : null}
          </label>
          <TextField
            defaultValue={String(brief.recruiterTarget)}
            disabled={isSubmitting || isActive}
            {...(recruiterTargetError ? { error: recruiterTargetError } : {})}
            hint="Any positive whole number. There is no hard maximum."
            id="recruiter-target"
            inputMode="numeric"
            label="Recruiters to find"
            min="1"
            name="recruiterTarget"
            required
            type="number"
          />
          <div className="recruiter-brief-actions">
            <Button
              busy={isSubmitting}
              disabled={isSubmitting || isActive}
              type="submit"
              variant="primary"
            >
              <LoaderCircle aria-hidden="true" size={16} />
              {isSubmitting
                ? "Starting research"
                : isActive
                  ? "Research in progress"
                  : "Start research"}
            </Button>
            <p>
              Uses the existing local ChatGPT Business login. It does not use an API key, a
              logged-in LinkedIn session, or private contact data.
            </p>
          </div>
        </Form>
      </section>

      {actionError ? (
        <p className="recruiter-action-error" role="alert">
          {actionError.field
            ? "Please correct the highlighted field before starting research."
            : actionError.message}
        </p>
      ) : null}

      {research ? (
        <ResearchRunResult research={research} isSubmitting={isSubmitting} />
      ) : (
        <EmptyResearchState />
      )}
    </div>
  );
}

function fieldError(
  actionError: RecruiterResearchPageProps["actionError"],
  field: RecruiterResearchStartField,
): string | undefined {
  return actionError?.field === field ? actionError.message : undefined;
}

function textareaAccessibility(id: string, error: string | undefined, hasHint: boolean) {
  const describedBy = [hasHint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ");
  return {
    "aria-describedby": describedBy || undefined,
    "aria-invalid": error ? true : undefined,
  };
}

function selectAccessibility(id: string, error: string | undefined) {
  const describedBy = [`${id}-hint`, error ? `${id}-error` : undefined].filter(Boolean).join(" ");
  return {
    "aria-describedby": describedBy,
    "aria-invalid": error ? true : undefined,
  };
}

function EmptyResearchState() {
  return (
    <section className="empty-state recruiter-empty-state">
      <span className="empty-icon" aria-hidden="true">
        <LoaderCircle size={27} />
      </span>
      <h2>Ready for a local scan</h2>
      <p>
        Start with a technology brief and a recruiter target. Firm observations appear before the
        recruiter stage completes.
      </p>
    </section>
  );
}

function ResearchRunResult({
  isSubmitting,
  research,
}: {
  readonly isSubmitting: boolean;
  readonly research: RecruiterResearchRunView;
}) {
  const { coverage, failures, observations, run } = research;
  const firms = observations.filter((observation) => observation.kind === "firm");
  const recruiters = observations.filter((observation) => observation.kind === "recruiter");
  const isActive = activeStatuses.has(run.status);
  const canRetry = ["cancelled", "failed", "partial"].includes(run.status);

  return (
    <section className="recruiter-run-section" aria-labelledby="recruiter-results-title">
      <div className="section-heading">
        <h2 id="recruiter-results-title">Run results</h2>
        <span>{run.id}</span>
      </div>
      <div className="panel recruiter-run-panel">
        <div className="recruiter-run-summary" role="status">
          <RunStatus status={run.status} />
          <dl>
            <div>
              <dt>Firms</dt>
              <dd>
                {coverage.observedFirmCount} / {coverage.firmTarget}
              </dd>
            </div>
            <div>
              <dt>Recruiters</dt>
              <dd>
                {coverage.observedRecruiterCount} / {coverage.recruiterTarget}
              </dd>
            </div>
            <div>
              <dt>Checkpoint</dt>
              <dd>{run.checkpoint}</dd>
            </div>
            <div>
              <dt>Requests</dt>
              <dd>
                {coverage.usedRequests.firms + coverage.usedRequests.recruiters} used /{" "}
                {coverage.remainingRequests.firms + coverage.remainingRequests.recruiters} remaining
              </dd>
            </div>
          </dl>
        </div>
        <div className="recruiter-run-provenance">
          {run.retryOfRunId ? <span>Retry of {run.retryOfRunId}</span> : null}
          <span>
            Policy {run.policy.id} v{run.policy.version}
          </span>
          <span>
            Source plan {run.sourcePlan.id} v{run.sourcePlan.version}
          </span>
          <span>
            Execution: {run.policy.execution.model}, {run.policy.execution.reasoningEffort} effort,{" "}
            {run.policy.execution.webSearchEnabled ? "public web search" : "web search disabled"},{" "}
            {run.policy.execution.ephemeral ? "ephemeral" : "persistent"},{" "}
            {run.policy.execution.sandboxMode} sandbox,{" "}
            {run.policy.execution.automaticRetry ? "automatic retry" : "no automatic retry"}
          </span>
          <span>
            Criteria: {run.brief.criteria.targetLocations.join(", ")};{" "}
            {run.brief.criteria.specialisms.join(", ")}; {run.brief.criteria.industries.join(", ")}
          </span>
          <span>{run.policy.retention.rule}</span>
          <span>{run.policy.retention.deletionRule}</span>
          {coverage.budgetExhaustion ? (
            <span>Budget exhausted: {coverage.budgetExhaustion.stage} requests.</span>
          ) : null}
          <span>{run.completionReason ?? "Awaiting the next source stage."}</span>
        </div>
        <SourcePlanStatus failures={failures} observations={observations} run={run} />
        <div className="recruiter-run-controls">
          {isActive ? (
            <Form method="post">
              <input name="intent" type="hidden" value="cancel" />
              <input name="runId" type="hidden" value={run.id} />
              <Button disabled={isSubmitting} type="submit" variant="danger">
                <Square aria-hidden="true" size={15} />
                Cancel research
              </Button>
            </Form>
          ) : null}
          {canRetry ? (
            <Form method="post">
              <input name="intent" type="hidden" value="retry" />
              <input name="runId" type="hidden" value={run.id} />
              <Button disabled={isSubmitting} type="submit" variant="secondary">
                <RotateCcw aria-hidden="true" size={15} />
                Retry with the same plan
              </Button>
            </Form>
          ) : null}
        </div>

        {failures.length > 0 ? (
          <div className="recruiter-failure-list" role="alert">
            <h3>Source failures</h3>
            {failures.map((failure) => (
              <p key={`${failure.stage}-${failure.recordedAt.toISOString()}`}>
                {failure.stage}: {failure.message}
              </p>
            ))}
          </div>
        ) : null}

        <div className="recruiter-firm-list">
          {firms.length > 0 ? (
            firms.map((firm) => {
              const firmRecruiters = recruiters.filter(
                (recruiter) => recruiter.companyName === firm.companyName,
              );
              return (
                <article className="recruiter-firm-observation" key={firm.websiteUrl}>
                  <header>
                    <div>
                      <span className="recruiter-record-label">Firm observation</span>
                      <h3>{firm.companyName}</h3>
                    </div>
                    <a href={firm.evidence.sourceUrl} rel="noreferrer" target="_blank">
                      Evidence source
                    </a>
                  </header>
                  <p>{firm.reason}</p>
                  <ObservationEvidence
                    evidence={firm.evidence}
                    industries={firm.industries}
                    specialisms={firm.specialisms}
                  />
                  <div className="recruiter-nested-list">
                    <h4>
                      {firmRecruiters.length} named recruiter
                      {firmRecruiters.length === 1 ? "" : "s"}
                    </h4>
                    {firmRecruiters.length > 0 ? (
                      <ul>
                        {firmRecruiters.map((recruiter) => (
                          <li key={recruiter.linkedInUrl}>
                            <div>
                              <strong>{recruiter.name}</strong>
                              <span>{recruiter.title}</span>
                            </div>
                            <a href={recruiter.linkedInUrl} rel="noreferrer" target="_blank">
                              Public LinkedIn profile
                            </a>
                            <blockquote>{recruiter.evidence.excerpt}</blockquote>
                            <small>
                              Observed {recruiter.evidence.observedAt} ·{" "}
                              {recruiter.evidence.confidence} confidence ·{" "}
                              {recruiter.evidence.adapterId} v{recruiter.evidence.policyVersion}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="muted">
                        Recruiter research is still in progress for this firm.
                      </p>
                    )}
                  </div>
                </article>
              );
            })
          ) : (
            <div className="recruiter-empty-results">
              <LoaderCircle aria-hidden="true" size={20} />
              <p>
                Waiting for a schema-validated firm result. Progress messages are not saved as
                research facts.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SourcePlanStatus({
  failures,
  observations,
  run,
}: {
  readonly failures: readonly ResearchSourceFailure[];
  readonly observations: readonly ResearchObservation[];
  readonly run: ResearchRun;
}) {
  return (
    <section className="recruiter-source-plan" aria-labelledby="recruiter-source-plan-title">
      <h3 id="recruiter-source-plan-title">Source plan</h3>
      <p>These public sources and policy versions were frozen when this run started.</p>
      <ul aria-label="Planned public sources">
        {run.sourcePlan.entries.map((entry) => {
          const status = sourcePlanStatus({ entry, failures, observations, run });
          return (
            <li key={entry.id}>
              <div>
                <strong>{entry.stage === "firms" ? "Firm sources" : "Recruiter sources"}</strong>
                <span>{entry.allowedPublicSources.join(", ")}</span>
                <small>
                  {entry.id} · {entry.adapterId} v{entry.policyVersion}
                </small>
              </div>
              <div className="recruiter-source-plan-outcome">
                <strong className={`recruiter-source-plan-status-${status.kind}`}>
                  {status.label}
                </strong>
                <span>{status.detail}</span>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function sourcePlanStatus({
  entry,
  failures,
  observations,
  run,
}: {
  readonly entry: ResearchRun["sourcePlan"]["entries"][number];
  readonly failures: readonly ResearchSourceFailure[];
  readonly observations: readonly ResearchObservation[];
  readonly run: ResearchRun;
}): {
  readonly detail: string;
  readonly kind: "completed" | "failed" | "in-progress" | "queued" | "skipped";
  readonly label: "Completed" | "Failed" | "In progress" | "Queued" | "Skipped";
} {
  const failure = failures.find((candidate) => candidate.stage === entry.stage);
  if (failure) {
    return { detail: failure.message, kind: "failed", label: "Failed" };
  }
  const observationKind = entry.stage === "firms" ? "firm" : "recruiter";
  const observationCount = observations.filter(
    (observation) => observation.kind === observationKind,
  ).length;
  if (observationCount > 0) {
    return {
      detail: `${observationCount} observation${observationCount === 1 ? "" : "s"} saved.`,
      kind: "completed",
      label: "Completed",
    };
  }
  if (activeStatuses.has(run.status)) {
    return run.checkpoint === entry.stage
      ? { detail: "Research is in progress.", kind: "in-progress", label: "In progress" }
      : { detail: "Waiting for the preceding source stage.", kind: "queued", label: "Queued" };
  }
  return {
    detail: `This stage did not start because the run ${run.status}.`,
    kind: "skipped",
    label: "Skipped",
  };
}

function RunStatus({ status }: { readonly status: ResearchRun["status"] }) {
  const content = {
    cancelled: { icon: CircleX, label: "Cancelled" },
    completed: { icon: CheckCircle2, label: "Complete" },
    failed: { icon: CircleAlert, label: "Failed" },
    interrupted: { icon: LoaderCircle, label: "Resuming" },
    partial: { icon: CircleAlert, label: "Partial" },
    pending: { icon: LoaderCircle, label: "Queued" },
    running: { icon: LoaderCircle, label: "Researching" },
  }[status];
  const Icon = content.icon;
  return (
    <span className={`recruiter-run-status recruiter-run-status-${status}`}>
      <Icon aria-hidden="true" size={18} />
      {content.label}
    </span>
  );
}

function ObservationEvidence({
  evidence,
  industries,
  specialisms,
}: {
  readonly evidence: import("@/contexts/recruiter-engagement/domain/observation").Evidence;
  readonly industries: readonly string[];
  readonly specialisms: readonly string[];
}) {
  return (
    <div className="recruiter-evidence">
      <blockquote>{evidence.excerpt}</blockquote>
      <div>
        <a href={evidence.sourceUrl} rel="noreferrer" target="_blank">
          Evidence source
        </a>
        <span>
          Observed {evidence.observedAt} · {evidence.confidence} confidence · {evidence.adapterId} v
          {evidence.policyVersion}
        </span>
        {industries.map((industry) => (
          <span className="recruiter-tag" key={industry}>
            {industry}
          </span>
        ))}
        {specialisms.map((specialism) => (
          <span className="recruiter-tag recruiter-specialism" key={specialism}>
            {specialism}
          </span>
        ))}
      </div>
    </div>
  );
}
