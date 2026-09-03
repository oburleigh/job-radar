import {
  Button,
  PageHeader,
  SelectField,
  TextField,
  TokenAutocomplete,
  type TokenAutocompleteOption,
} from "@job-radar/design-ui";
import { CheckCircle2, CircleAlert, CircleX, LoaderCircle, RotateCcw, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Form, Link, useNavigation } from "react-router";
import type { ShortlistResult } from "@/contexts/recruiter-engagement/application/shortlists/manage-shortlists";
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
import { useRevalidationPoll } from "@/platform/http/use-revalidation-poll";
import { RecruiterEvidenceHistory } from "./recruiter-evidence-history";
import { RecruiterLocationCombobox } from "./recruiter-location-combobox";
import { AddToShortlist, ShortlistWorkspace } from "./shortlist-workspace";

import "./styles.css";

// Carried over from the interval this poll replaced. Cadence belongs in the recruiter research
// settings beside the rest of the run policy, and moves there once its placement is decided.
const RESEARCH_PROGRESS_POLL_INTERVAL_MS = 400;

export type RecruiterResearchRunView = {
  readonly coverage: ResearchCoverage;
  readonly directory: RankedRecruiterDirectory;
  readonly failures: readonly ResearchSourceFailure[];
  readonly observations: readonly ResearchObservation[];
  readonly run: ResearchRun;
  readonly shortlists: readonly ShortlistResult[];
};

type RecruiterResearchPageProps = {
  readonly actionError?: {
    readonly field?: RecruiterResearchStartField;
    readonly message: string;
  };
  readonly criteriaOptions: {
    readonly industries: readonly string[];
    readonly specialisms: readonly string[];
  };
  readonly defaultTargets: Pick<ResearchRun["brief"], "firmTarget" | "recruiterTarget">;
  readonly initialLocationOptions?: readonly LocationOption[];
  readonly providerSelection?: {
    readonly providers: readonly {
      readonly configured: boolean;
      readonly label: string;
      readonly name: string;
    }[];
    readonly selectedProvider: string;
  };
  readonly research?: RecruiterResearchRunView;
};

const activeStatuses = new Set<ResearchRun["status"]>(["pending", "running", "interrupted"]);
const researchFieldControlIds: Record<RecruiterResearchStartField, string> = {
  brief: "recruiter-brief",
  firmTarget: "firm-target",
  industries: "recruiter-industries",
  providerName: "recruiter-search-provider",
  recruiterTarget: "recruiter-target",
  specialisms: "recruiter-specialisms",
  targetLocations: "recruiter-target-locations",
};

export function RecruiterResearchPage({
  actionError,
  criteriaOptions,
  defaultTargets,
  initialLocationOptions,
  providerSelection,
  research,
}: RecruiterResearchPageProps) {
  const providers = providerSelection?.providers ?? [];
  const selectedProvider = providerSelection?.selectedProvider ?? "";
  const navigation = useNavigation();
  const [startRequested, setStartRequested] = useState(false);
  const startNavigationObserved = useRef(false);
  const isSubmitting = navigation.state === "submitting";
  const navigationIsStarting =
    navigation.state !== "idle" && navigation.formData?.get("intent") === "start";
  const isStarting = startRequested || navigationIsStarting;
  const run = research?.run;
  const isActive = run ? activeStatuses.has(run.status) : false;
  const briefError = fieldError(actionError, "brief");
  const targetLocationsError = fieldError(actionError, "targetLocations");
  const specialismsError = fieldError(actionError, "specialisms");
  const industriesError = fieldError(actionError, "industries");
  const providerNameError = fieldError(actionError, "providerName");
  const firmTargetError = fieldError(actionError, "firmTarget");
  const recruiterTargetError = fieldError(actionError, "recruiterTarget");
  const loadedBriefDescription = run?.brief.description ?? "";
  const loadedIndustries = run?.brief.criteria.industries.join("\n") ?? "";
  const loadedSpecialisms = run?.brief.criteria.specialisms.join("\n") ?? "";
  const loadedTargetLocations = run?.brief.criteria.targetLocations.join("\n") ?? "";
  const loadedBriefKey = run?.id ?? "new-research";
  const previousLoadedBriefKey = useRef(loadedBriefKey);
  const [briefDescription, setBriefDescription] = useState(loadedBriefDescription);
  const [industries, setIndustries] = useState<readonly string[]>(criteriaValues(loadedIndustries));
  const [optionalContextOpen, setOptionalContextOpen] = useState(
    loadedBriefDescription !== "" || Boolean(briefError),
  );
  const [providerName, setProviderName] = useState(() =>
    availableProviderName(providers, selectedProvider, Boolean(research)),
  );
  const [targetLocations, setTargetLocations] = useState<readonly string[]>(
    criteriaValues(loadedTargetLocations),
  );
  const [specialisms, setSpecialisms] = useState<readonly string[]>(
    criteriaValues(loadedSpecialisms),
  );
  const providerIsConfigured =
    !providerSelection ||
    providers.find((provider) => provider.name === providerName)?.configured === true;

  useEffect(() => {
    if (navigationIsStarting) {
      startNavigationObserved.current = true;
      return;
    }
    if (navigation.state === "idle" && startNavigationObserved.current) {
      startNavigationObserved.current = false;
      setStartRequested(false);
    }
  }, [navigation.state, navigationIsStarting]);

  useRevalidationPoll(isActive, RESEARCH_PROGRESS_POLL_INTERVAL_MS);

  useEffect(() => {
    if (previousLoadedBriefKey.current === loadedBriefKey) {
      return;
    }
    previousLoadedBriefKey.current = loadedBriefKey;
    setBriefDescription(loadedBriefDescription);
    setIndustries(criteriaValues(loadedIndustries));
    setOptionalContextOpen(loadedBriefDescription !== "");
    setProviderName(availableProviderName(providers, selectedProvider, Boolean(research)));
    setSpecialisms(criteriaValues(loadedSpecialisms));
    setTargetLocations(criteriaValues(loadedTargetLocations));
  }, [
    loadedBriefDescription,
    loadedBriefKey,
    loadedIndustries,
    loadedSpecialisms,
    loadedTargetLocations,
    providers,
    research,
    selectedProvider,
  ]);

  useEffect(() => {
    if (!actionError?.field) {
      return;
    }
    if (actionError.field === "brief") {
      setOptionalContextOpen(true);
      window.requestAnimationFrame(() => {
        document.getElementById(researchFieldControlIds.brief)?.focus();
      });
      return;
    }
    document.getElementById(researchFieldControlIds[actionError.field])?.focus();
  }, [actionError]);

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
          onSubmit={() => setStartRequested(true)}
        >
          <input name="intent" type="hidden" value="start" />
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
              label="Firms to find (required)"
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
              label="Recruiters to find (required)"
              min="1"
              name="recruiterTarget"
              required
              type="number"
            />
          </div>
          <TokenAutocomplete
            disabled={isSubmitting || isActive}
            {...(specialismsError ? { error: specialismsError } : {})}
            hint={criterionHint(
              "Choose the professional disciplines recruiters should cover.",
              criteriaOptions.specialisms,
            )}
            id="recruiter-specialisms"
            invalidSelectionMessage="Choose a Specialism from the suggestions."
            label="Specialisms (required)"
            name="specialisms"
            onChange={setSpecialisms}
            options={criterionOptions([...criteriaOptions.specialisms, ...specialisms])}
            placeholder="Choose a Specialism"
            required
            secondaryPlaceholder="Add another Specialism"
            values={specialisms}
          />
          <TokenAutocomplete
            disabled={isSubmitting || isActive}
            {...(industriesError ? { error: industriesError } : {})}
            hint={criterionHint(
              "Choose the industries where recruiters should have hiring experience.",
              criteriaOptions.industries,
            )}
            id="recruiter-industries"
            invalidSelectionMessage="Choose a Target industry from the suggestions."
            label="Target industries (required)"
            name="industries"
            onChange={setIndustries}
            options={criterionOptions([...criteriaOptions.industries, ...industries])}
            placeholder="Choose a Target industry"
            required
            secondaryPlaceholder="Add another Target industry"
            values={industries}
          />
          <details
            className="recruiter-optional-context"
            onToggle={(event) => setOptionalContextOpen(event.currentTarget.open)}
            open={optionalContextOpen}
          >
            <summary>Add optional search context</summary>
            <label className="recruiter-textarea-label" htmlFor="recruiter-brief">
              <span>Search brief (optional)</span>
              <textarea
                value={briefDescription}
                disabled={isSubmitting || isActive}
                {...textareaAccessibility("recruiter-brief", briefError, true)}
                id="recruiter-brief"
                maxLength={1000}
                name="brief"
                onChange={(event) => setBriefDescription(event.target.value)}
                placeholder="e.g. Director-level roles at product-led companies"
                rows={3}
              />
              <small id="recruiter-brief-hint">
                Use this only for details the selections above cannot express, such as seniority or
                employer type.
              </small>
              {briefError ? (
                <small className="jr-field-error" id="recruiter-brief-error">
                  {briefError}
                </small>
              ) : null}
            </label>
          </details>
          <section className="recruiter-execution" aria-labelledby="research-adapter-title">
            <div className="recruiter-execution-copy">
              <h3 id="research-adapter-title">Active sources</h3>
              <p>
                Public firm websites and public recruiter profile pages{" "}
                {providerSelection
                  ? "through the configured public web search adapter"
                  : "researched through the Codex CLI installed on this machine"}
                . No account-linked source is connected.
              </p>
            </div>
            {providerSelection ? (
              <div className="recruiter-execution-fields">
                <SelectField
                  disabled={isSubmitting || isActive}
                  {...(providerNameError ? { error: providerNameError } : {})}
                  hint="This provider supplies public firm and recruiter profile results for the run."
                  id="recruiter-search-provider"
                  label="Search provider"
                  name="providerName"
                  onChange={(event) => setProviderName(event.target.value)}
                  required
                  value={providerName}
                >
                  {!providerIsConfigured ? (
                    <option disabled value="">
                      Configure a search provider first
                    </option>
                  ) : null}
                  {providers.map((provider) => (
                    <option
                      disabled={!provider.configured}
                      key={provider.name}
                      value={provider.name}
                    >
                      {provider.label}
                      {provider.configured ? "" : " (not configured)"}
                    </option>
                  ))}
                </SelectField>
                {!providerIsConfigured && !isActive ? (
                  <p className="recruiter-provider-configuration">
                    <Link to="/settings/recruiter-search/public-search">
                      Configure a search provider
                    </Link>{" "}
                    before starting Recruiter Search.
                  </p>
                ) : null}
              </div>
            ) : null}
          </section>
          <div className="recruiter-brief-actions">
            <Button
              busy={isStarting}
              disabled={isStarting || isActive || !providerIsConfigured}
              type="submit"
              variant="primary"
            >
              {isStarting ? (
                <LoaderCircle aria-hidden="true" className="recruiter-progress-spinner" size={16} />
              ) : null}
              {isStarting
                ? "Starting Recruiter Search"
                : isActive
                  ? "Research in progress"
                  : "Start research"}
            </Button>
            {isStarting || isActive ? (
              <div className="recruiter-start-status" role="status" aria-live="polite">
                <strong>
                  {isStarting ? "Starting Recruiter Search" : researchStageLabel(run?.checkpoint)}
                </strong>
                <span>
                  {isStarting
                    ? "Saving your criteria and starting firm research."
                    : "The run continues in the background."}{" "}
                  You can leave this page and follow it in <Link to="/activity">Activity</Link>.
                </span>
              </div>
            ) : (
              <p>
                Uses the selected configured search provider. It does not use a logged-in account
                session or collect private contact data.
              </p>
            )}
          </div>
        </Form>
      </section>

      {actionError ? (
        <p className="recruiter-action-error" role="alert">
          Could not start research. {actionError.message}
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

function availableProviderName(
  providers: NonNullable<RecruiterResearchPageProps["providerSelection"]>["providers"],
  selectedProvider: string,
  retainSelectedProvider: boolean,
): string {
  const selected = providers.find((provider) => provider.name === selectedProvider);
  if (retainSelectedProvider && selected) {
    return selected.name;
  }
  if (selected?.configured) {
    return selected.name;
  }
  return providers.find((provider) => provider.configured)?.name ?? "";
}

function criteriaValues(value: string): readonly string[] {
  return value === "" ? [] : value.split("\n");
}

function criterionOptions(values: readonly string[]): readonly TokenAutocompleteOption[] {
  return [...new Set(values)].map((value) => ({ label: value, value }));
}

function criterionHint(instruction: string, options: readonly string[]): string {
  return `${instruction} Examples include ${options.slice(0, 4).join(", ")}.`;
}

function researchStageLabel(stage: ResearchRun["checkpoint"] | undefined): string {
  return stage === "recruiters" ? "Finding recruiters" : "Researching firms";
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
        Choose a market focus and targets. Firm observations appear before the recruiter stage
        completes.
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
  const { coverage, directory, failures, observations, run, shortlists } = research;
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
            Public search with a frozen {run.policy.rateLimit.stageRequestLimit}-request stage
            budget.
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

        <ShortlistWorkspace isSubmitting={isSubmitting} runId={run.id} shortlists={shortlists} />

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
                    <span
                      className="recruiter-record-label"
                      data-qualified={firm.qualification.qualified}
                    >
                      {firm.qualification.qualified
                        ? "Qualified recruitment firm"
                        : "Unqualified firm observation"}{" "}
                      · {firm.score} points
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
                <RankingBreakdown contributions={firm.rankingContributions} />
                <ConflictReview
                  conflicts={firm.conflicts}
                  kind="firm"
                  record={firm}
                  runId={run.id}
                />
                <RecruiterEvidenceHistory evidence={firm.evidence} />
                <div className="recruiter-nested-list">
                  <h4>
                    {firm.recruiters.length} named recruiter
                    {firm.recruiters.length === 1 ? "" : "s"}
                  </h4>
                  {firm.recruiters.length > 0 ? (
                    <ul>
                      {firm.recruiters.map((recruiter) => (
                        <RecruiterResult
                          isSubmitting={isSubmitting}
                          key={recruiter.id}
                          recruiter={recruiter}
                          runId={run.id}
                          shortlists={shortlists}
                        />
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
                <RecruiterResult
                  isSubmitting={isSubmitting}
                  key={recruiter.id}
                  recruiter={recruiter}
                  runId={run.id}
                  shortlists={shortlists}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </section>
  );
}

function RecruiterResult({
  isSubmitting,
  recruiter,
  runId,
  shortlists,
}: {
  readonly isSubmitting: boolean;
  readonly recruiter: RankedRecruiter;
  readonly runId: string;
  readonly shortlists: readonly ShortlistResult[];
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
      <a href={recruiter.profileUrl} rel="noreferrer" target="_blank">
        Public profile
      </a>
      <AddToShortlist
        isSubmitting={isSubmitting}
        recruiter={recruiter}
        runId={runId}
        shortlists={shortlists}
      />
      <MatchExplanation
        reasons={recruiter.matchReasons}
        unavailable={recruiter.unavailableFactors}
      />
      <RankingBreakdown contributions={recruiter.rankingContributions} />
      <ConflictReview
        conflicts={recruiter.conflicts}
        kind="recruiter"
        record={recruiter}
        runId={runId}
      />
      <RecruiterEvidenceHistory evidence={recruiter.evidence} />
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

function RankingBreakdown({
  contributions,
}: {
  readonly contributions: RankedFirm["rankingContributions"];
}) {
  return (
    <details className="recruiter-ranking-breakdown">
      <summary>Ranking breakdown</summary>
      <ul>
        {contributions.map((contribution) => (
          <li key={contribution.factor}>
            <strong>
              {rankingFactorLabel(contribution.factor)} · {contribution.points}{" "}
              {contribution.points === 1 ? "point" : "points"}
            </strong>
            <span>{contribution.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function rankingFactorLabel(factor: RankedFirm["rankingContributions"][number]["factor"]): string {
  const labels = {
    currentMandatesOrActivity: "Current mandates or activity",
    evidenceFreshnessAndQuality: "Evidence freshness and quality",
    namedRecruiterOrTeamEvidence: "Named Recruiter or team Evidence",
    recruiterRoleAndSeniority: "Recruiter role and seniority",
    scaleOrTrackRecord: "Scale or track record",
    specialism: "Specialism",
    targetMarketOperatingDepth: "Target-market operating depth",
  } as const;
  return labels[factor];
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
  readonly kind: "completed" | "failed" | "in-progress" | "partial" | "queued" | "skipped";
  readonly label: "Completed" | "Failed" | "In progress" | "Partial" | "Queued" | "Skipped";
} {
  const failure = failures.find((candidate) => candidate.stage === entry.stage);
  if (failure) {
    return { detail: failure.message, kind: "failed", label: "Failed" };
  }
  const observationKind = entry.stage === "firms" ? "firm" : "recruiter";
  const observationCount = observations.filter(
    (observation) => observation.kind === observationKind,
  ).length;
  if (run.budgetExhaustion?.stage === entry.stage) {
    return {
      detail: `${observationCount} observation${observationCount === 1 ? "" : "s"} saved before the request budget was exhausted.`,
      kind: "partial",
      label: "Partial",
    };
  }
  if (observationCount > 0) {
    return {
      detail: `${observationCount} observation${observationCount === 1 ? "" : "s"} saved.`,
      kind: "completed",
      label: "Completed",
    };
  }
  const stageCompletedWithoutObservations =
    run.status === "completed" &&
    (entry.stage === "firms" ? run.checkpoint !== "firms" : run.checkpoint === "completed");
  if (stageCompletedWithoutObservations) {
    return {
      detail: "0 observations saved.",
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
