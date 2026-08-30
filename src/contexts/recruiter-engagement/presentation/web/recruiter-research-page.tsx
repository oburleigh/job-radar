import { Button, PageHeader, TextField } from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, LoaderCircle, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, useNavigation, useRevalidator } from "react-router";
import type { ResearchObservation } from "@/contexts/recruiter-engagement/domain/observation";
import type {
  DirectoryConflict,
  RankedFirm,
  RankedRecruiter,
  RankedRecruiterDirectory,
} from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import type {
  ResearchCoverage,
  ResearchRun,
  ResearchSourceFailure,
} from "@/contexts/recruiter-engagement/domain/research-run";
import type { RecruiterResearchStartField } from "@/contexts/recruiter-engagement/presentation/web/requests/recruiter-research-request";
import type { LocationOption } from "@/platform/http/location-option";
import { RecruiterLocationCombobox } from "./recruiter-location-combobox";

import "./styles.css";

export type RecruiterResearchRunView = {
  readonly coverage: ResearchCoverage;
  readonly directory: RankedRecruiterDirectory;
  readonly failures: readonly ResearchSourceFailure[];
  readonly observations: readonly ResearchObservation[];
  readonly run: ResearchRun;
};

type RecruiterResearchPageProps = {
  readonly actionError?: {
    readonly field?: RecruiterResearchStartField;
    readonly message: string;
  };
  readonly defaultTargets: Pick<ResearchRun["brief"], "firmTarget" | "recruiterTarget">;
  readonly execution: Pick<ResearchRun["policy"]["execution"], "model" | "reasoningEffort">;
  readonly initialLocationOptions?: readonly LocationOption[];
  readonly research?: RecruiterResearchRunView;
};

const activeStatuses = new Set<ResearchRun["status"]>(["pending", "running", "interrupted"]);

export function RecruiterResearchPage({
  actionError,
  defaultTargets,
  execution,
  initialLocationOptions,
  research,
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
  const firmTargetError = fieldError(actionError, "firmTarget");
  const recruiterTargetError = fieldError(actionError, "recruiterTarget");
  const loadedBriefDescription = run?.brief.description ?? "";
  const loadedTargetLocations = run?.brief.criteria.targetLocations.join("\n") ?? "";
  const loadedBriefKey = run?.id ?? "new-research";
  const previousLoadedBriefKey = useRef(loadedBriefKey);
  const [briefDescription, setBriefDescription] = useState(loadedBriefDescription);
  const [targetLocations, setTargetLocations] = useState<readonly string[]>(
    loadedTargetLocations === "" ? [] : loadedTargetLocations.split("\n"),
  );

  useEffect(() => {
    if (!isActive) {
      return undefined;
    }
    const timer = window.setInterval(() => revalidator.revalidate(), 400);
    return () => window.clearInterval(timer);
  }, [isActive, revalidator]);

  useEffect(() => {
    if (previousLoadedBriefKey.current === loadedBriefKey) {
      return;
    }
    previousLoadedBriefKey.current = loadedBriefKey;
    setBriefDescription(loadedBriefDescription);
    setTargetLocations(loadedTargetLocations === "" ? [] : loadedTargetLocations.split("\n"));
  }, [loadedBriefDescription, loadedBriefKey, loadedTargetLocations]);

  return (
    <div className="page recruiter-research-page">
      <PageHeader
        title="Recruiter Search"
        description="Run a local, public-source scan of recruitment firms and their named recruiters. Counts describe this run, not the whole market."
      />

      <section className="panel recruiter-brief-panel" aria-labelledby="recruiter-brief-title">
        <div className="recruiter-panel-heading">
          <div>
            <h2 id="recruiter-brief-title">Set the market focus</h2>
          </div>
          <div className="recruiter-panel-heading-actions">
            <span>Public web only</span>
          </div>
        </div>
        <Form
          key={run?.id ?? "new-research"}
          method="post"
          className="recruiter-brief-form"
          noValidate
        >
          <input name="intent" type="hidden" value="start" />
          <label className="recruiter-textarea-label" htmlFor="recruiter-brief">
            <span>Search brief</span>
            <textarea
              value={briefDescription}
              disabled={isSubmitting || isActive}
              {...textareaAccessibility("recruiter-brief", briefError, true)}
              id="recruiter-brief"
              maxLength={1000}
              name="brief"
              onChange={(event) => setBriefDescription(event.target.value)}
              placeholder="Describe the roles, sectors, seniority, or market focus for this run"
              rows={5}
            />
            <small id="recruiter-brief-hint">
              Add any plain-language context that is not captured by the structured criteria.
            </small>
            {briefError ? (
              <small className="jr-field-error" id="recruiter-brief-error">
                {briefError}
              </small>
            ) : null}
          </label>
          <RecruiterLocationCombobox
            disabled={isSubmitting || isActive}
            {...(targetLocationsError ? { error: targetLocationsError } : {})}
            {...(initialLocationOptions ? { initialOptions: initialLocationOptions } : {})}
            name="targetLocations"
            onChange={setTargetLocations}
            values={targetLocations}
          />
          <div className="recruiter-target-fields">
            <TextField
              defaultValue={String(run?.brief.firmTarget ?? defaultTargets.firmTarget)}
              disabled={isSubmitting || isActive}
              {...(firmTargetError ? { error: firmTargetError } : {})}
              hint="Cannot exceed the recruiter target."
              id="firm-target"
              inputMode="numeric"
              label="Firms to find"
              min="1"
              name="firmTarget"
              required
              type="number"
            />
            <TextField
              defaultValue={String(run?.brief.recruiterTarget ?? defaultTargets.recruiterTarget)}
              disabled={isSubmitting || isActive}
              {...(recruiterTargetError ? { error: recruiterTargetError } : {})}
              hint="Positive whole numbers with no fixed maximum."
              id="recruiter-target"
              inputMode="numeric"
              label="Recruiters to find"
              min="1"
              name="recruiterTarget"
              required
              type="number"
            />
          </div>
          <label className="recruiter-textarea-label" htmlFor="recruiter-specialisms">
            <span>Specialisms</span>
            <textarea
              defaultValue={run?.brief.criteria.specialisms.join(", ") ?? ""}
              disabled={isSubmitting || isActive}
              {...textareaAccessibility("recruiter-specialisms", specialismsError, true)}
              id="recruiter-specialisms"
              name="specialisms"
              placeholder="e.g. Executive search, Clinical research"
              rows={2}
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
              defaultValue={run?.brief.criteria.industries.join(", ") ?? ""}
              disabled={isSubmitting || isActive}
              {...textareaAccessibility("recruiter-industries", industriesError, true)}
              id="recruiter-industries"
              name="industries"
              placeholder="e.g. Life sciences, Consumer goods"
              rows={2}
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
          <section className="recruiter-execution" aria-labelledby="research-adapter-title">
            <div className="recruiter-execution-copy">
              <h3 id="research-adapter-title">Research adapter</h3>
              <p>
                <strong>Local Codex CLI.</strong> Choose a model or leave it empty to use your Codex
                account default. These values are saved locally and frozen with this run.
              </p>
            </div>
            <div className="recruiter-execution-fields">
              <TextField
                defaultValue={execution.model ?? ""}
                disabled={isSubmitting || isActive}
                id="recruiter-codex-model"
                label="Codex model"
                name="model"
                placeholder="Use Codex account default"
              />
              <TextField
                defaultValue={execution.reasoningEffort ?? ""}
                disabled={isSubmitting || isActive}
                id="recruiter-reasoning-effort"
                label="Reasoning effort"
                name="reasoningEffort"
                placeholder="Use Codex account default"
              />
            </div>
          </section>
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

function EmptyResearchState() {
  return (
    <section className="empty-state recruiter-empty-state">
      <span className="empty-icon" aria-hidden="true">
        <LoaderCircle size={27} />
      </span>
      <h2>Ready for a local scan</h2>
      <p>
        Start with a search brief and recruiter target. Firm observations appear before the
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
  const { coverage, directory, failures, observations, run } = research;
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
            Execution: {run.policy.execution.model ?? "Codex account default"},{" "}
            {run.policy.execution.reasoningEffort
              ? `${run.policy.execution.reasoningEffort} effort`
              : "default effort"}
            , {run.policy.execution.webSearchEnabled ? "public web search" : "web search disabled"},{" "}
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

        <IdentityReviews directory={directory} runId={run.id} />

        <div className="recruiter-directory-heading">
          <div>
            <h3>Recruiter directory</h3>
            <p>Canonical records accumulated across research runs, ranked for this search brief.</p>
          </div>
          <span>
            {directory.firms.length} firms ·{" "}
            {directory.firms.reduce((total, firm) => total + firm.recruiters.length, 0) +
              directory.unassociatedRecruiters.length}{" "}
            recruiters
          </span>
        </div>
        <div className="recruiter-firm-list">
          {directory.firms.length > 0 ? (
            directory.firms.map((firm) => (
              <article className="recruiter-firm-observation" key={firm.id}>
                <header>
                  <div>
                    <span className="recruiter-record-label">
                      Recruitment firm · {firm.score} points
                    </span>
                    <h3>{firm.name}</h3>
                  </div>
                  <a href={firm.websiteUrl} rel="noreferrer" target="_blank">
                    Firm website
                  </a>
                </header>
                <MatchExplanation
                  reasons={firm.matchReasons}
                  unavailable={firm.unavailableFactors}
                />
                <ConflictReview
                  conflicts={firm.conflicts}
                  kind="firm"
                  record={firm}
                  runId={run.id}
                />
                <EvidenceHistory evidence={firm.evidence} />
                <div className="recruiter-nested-list">
                  <h4>
                    {firm.recruiters.length} named recruiter
                    {firm.recruiters.length === 1 ? "" : "s"}
                  </h4>
                  {firm.recruiters.length > 0 ? (
                    <ul>
                      {firm.recruiters.map((recruiter) => (
                        <RecruiterResult key={recruiter.id} recruiter={recruiter} runId={run.id} />
                      ))}
                    </ul>
                  ) : (
                    <p className="muted">No recruiter is currently associated with this firm.</p>
                  )}
                </div>
              </article>
            ))
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
        {directory.unassociatedRecruiters.length > 0 ? (
          <section
            className="recruiter-nested-list recruiter-unassociated"
            aria-labelledby="unassociated-recruiters"
          >
            <div>
              <h3 id="unassociated-recruiters">Unassociated recruiters</h3>
              <p>
                These public recruiter records remain visible while their recruitment firm
                association is unresolved.
              </p>
            </div>
            <ul className="recruiter-unassociated-list">
              {directory.unassociatedRecruiters.map((recruiter) => (
                <RecruiterResult key={recruiter.id} recruiter={recruiter} runId={run.id} />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function RecruiterResult({
  recruiter,
  runId,
}: {
  readonly recruiter: RankedRecruiter;
  readonly runId: string;
}) {
  return (
    <li>
      <div>
        <strong>{recruiter.name}</strong>
        <span>
          {recruiter.title} · {recruiter.score} points
        </span>
        <span>Work email: {recruiter.workEmail ?? "Not retained"}</span>
      </div>
      <a href={recruiter.linkedInUrl} rel="noreferrer" target="_blank">
        Public LinkedIn profile
      </a>
      <MatchExplanation
        reasons={recruiter.matchReasons}
        unavailable={recruiter.unavailableFactors}
      />
      <ConflictReview
        conflicts={recruiter.conflicts}
        kind="recruiter"
        record={recruiter}
        runId={runId}
      />
      <EvidenceHistory evidence={recruiter.evidence} />
    </li>
  );
}

function IdentityReviews({
  directory,
  runId,
}: {
  readonly directory: RankedRecruiterDirectory;
  readonly runId: string;
}) {
  const pending = directory.identityReviews.filter((review) => review.status === "pending");
  if (pending.length === 0) {
    return null;
  }
  const recordName = (recordId: string) =>
    directory.firms.find((firm) => firm.id === recordId)?.name ??
    directory.firms
      .flatMap((firm) => firm.recruiters)
      .find((recruiter) => recruiter.id === recordId)?.name ??
    directory.unassociatedRecruiters.find((recruiter) => recruiter.id === recordId)?.name ??
    "Unknown record";
  return (
    <section className="recruiter-identity-reviews" aria-labelledby="identity-review-title">
      <h3 id="identity-review-title">Identity review</h3>
      <p>Possible matches remain separate until you decide.</p>
      {pending.map((review) => (
        <article key={review.id}>
          <div>
            <strong>
              {recordName(review.primaryRecordId)} and {recordName(review.candidateRecordId)}
            </strong>
            <span>{review.reason}</span>
          </div>
          <Form method="post">
            <input name="intent" type="hidden" value="resolve-identity" />
            <input name="runId" type="hidden" value={runId} />
            <input name="reviewId" type="hidden" value={review.id} />
            <Button name="decision" type="submit" value="merge">
              Merge
            </Button>
            <Button name="decision" type="submit" value="keep-separate">
              Keep separate
            </Button>
          </Form>
        </article>
      ))}
    </section>
  );
}

function MatchExplanation({
  reasons,
  unavailable,
}: {
  readonly reasons: readonly string[];
  readonly unavailable: readonly string[];
}) {
  return (
    <div className="recruiter-match-explanation">
      {reasons.length > 0 ? <p>{reasons.join(" ")}</p> : null}
      {unavailable.length > 0 ? <small>{unavailable.join(" ")}</small> : null}
    </div>
  );
}

function ConflictReview({
  conflicts,
  kind,
  record,
  runId,
}: {
  readonly conflicts: readonly DirectoryConflict[];
  readonly kind: "firm" | "recruiter";
  readonly record: RankedFirm | RankedRecruiter;
  readonly runId: string;
}) {
  if (conflicts.length === 0) {
    return null;
  }
  return (
    <div className="recruiter-conflicts">
      {conflicts.map((conflict) => {
        const currentValue = valueForConflict(record, conflict.field);
        return (
          <div key={conflict.field}>
            <span>
              Conflicting {humaniseField(conflict.field)}. Current: {currentValue}.
            </span>
            {conflict.values
              .filter((value) => value !== currentValue)
              .map((value) => (
                <Form method="post" key={value}>
                  <input name="intent" type="hidden" value="correct-directory-fact" />
                  <input name="runId" type="hidden" value={runId} />
                  <input name="kind" type="hidden" value={kind} />
                  <input name="recordId" type="hidden" value={record.id} />
                  <input name="field" type="hidden" value={conflict.field} />
                  <input name="value" type="hidden" value={value} />
                  <Button type="submit">Use {value}</Button>
                </Form>
              ))}
          </div>
        );
      })}
    </div>
  );
}

function EvidenceHistory({ evidence }: Pick<RankedFirm, "evidence">) {
  return (
    <details className="recruiter-evidence-history">
      <summary>
        {evidence.length} retained public source{evidence.length === 1 ? "" : "s"}
      </summary>
      <ul>
        {evidence.map((item) => (
          <li key={item.id}>
            <a href={item.observation.evidence.sourceUrl} rel="noreferrer" target="_blank">
              {item.observation.evidence.sourceUrl}
            </a>
            <span>{item.observation.evidence.excerpt}</span>
            <small>
              Observed {item.observation.evidence.observedAt} ·{" "}
              {item.observation.evidence.confidence} confidence ·{" "}
              {item.observation.evidence.adapterId} v{item.observation.evidence.policyVersion} ·{" "}
              {item.runIds.length} run{item.runIds.length === 1 ? "" : "s"}
            </small>
            {item.observation.kind === "recruiter" && item.observation.workEmail ? (
              <div className="recruiter-work-email-evidence">
                <strong>Work email: {item.observation.workEmail.address}</strong>
                <a
                  href={item.observation.workEmail.evidence.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Public email evidence
                </a>
                <small>
                  Observed {item.observation.workEmail.evidence.observedAt} ·{" "}
                  {item.observation.workEmail.evidence.confidence} confidence ·{" "}
                  {item.observation.workEmail.evidence.adapterId} v
                  {item.observation.workEmail.evidence.policyVersion}
                </small>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}

function valueForConflict(record: RankedFirm | RankedRecruiter, field: string): string {
  if (field === "name") {
    return record.name;
  }
  if ("title" in record && field === "title") {
    return record.title;
  }
  if ("companyName" in record && field === "companyName") {
    return record.companyName;
  }
  if ("workEmail" in record && field === "workEmail") {
    return record.workEmail ?? "Not retained";
  }
  return "Unknown";
}

function humaniseField(field: string): string {
  return field.replace(/([A-Z])/g, " $1").toLowerCase();
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
