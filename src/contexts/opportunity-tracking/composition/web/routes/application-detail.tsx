import {
  Button,
  buttonAttributes,
  Card,
  controlRowAttributes,
  PageHeader,
  Panel,
  SectionHeader,
  SelectField,
  TextField,
} from "@job-radar/design-ui";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { discoveryOpportunityContract } from "@/contexts/discovery/public-contract.server";
import { createApplicationDetailAction } from "@/contexts/opportunity-tracking/composition/web/routes/application-detail-action.server";
import { APPLICATION_STAGES } from "@/contexts/opportunity-tracking/domain/application-stage";
import {
  opportunityAdvisorContract,
  opportunityTrackingContract,
} from "@/contexts/opportunity-tracking/public-contract.server";

const changeApplication = createApplicationDetailAction({
  changeApplicationStage: opportunityTrackingContract.changeApplicationStage,
  acceptRecommendation: opportunityTrackingContract.acceptRecommendation,
  createNextAction: opportunityTrackingContract.createNextAction,
  changeNextAction: opportunityTrackingContract.changeNextAction,
  dismissRecommendation: opportunityTrackingContract.dismissRecommendation,
  planRelationship: opportunityAdvisorContract.planRelationship,
});

export function loader({ params }: { readonly params: { readonly applicationId?: string } }) {
  const applicationId = Number(params.applicationId);
  const application = Number.isSafeInteger(applicationId)
    ? opportunityTrackingContract
        .listApplications()
        .find((candidate) => candidate.id === applicationId)
    : undefined;
  if (!application) throw new Response("Application not found.", { status: 404 });
  return {
    application,
    opportunity: discoveryOpportunityContract.getOpportunitySnapshot(application),
    nextActions: opportunityTrackingContract.listApplicationActions(application.id),
    recommendations: opportunityTrackingContract.listApplicationRecommendations(application.id),
    timeline: opportunityTrackingContract.listTimeline(application.id),
    relationshipPlan: opportunityAdvisorContract.latestRelationshipPlan(application.id) ?? null,
    latestExecution:
      opportunityAdvisorContract.latestExecution({
        searchProfileId: application.searchProfileId,
        jobListingId: application.jobListingId,
        kind: "relationship-plan",
        applicationId: application.id,
      }) ?? null,
    advisorEnabled: opportunityAdvisorContract.policy().enabled,
  };
}

export async function action({ request }: { readonly request: Request }) {
  const formData = await request.clone().formData();
  return {
    ...(await changeApplication(request)),
    intent: formData.get("intent"),
    actionId: formData.get("actionId"),
    recommendationId: formData.get("recommendationId"),
    changeIntent: formData.get("changeIntent"),
  };
}

export default function ApplicationDetailPage() {
  const {
    advisorEnabled,
    application,
    nextActions,
    opportunity,
    recommendations,
    relationshipPlan,
    latestExecution,
    timeline,
  } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const title = opportunity?.title ?? `Application ${application.id}`;
  const nextStage = APPLICATION_STAGES[APPLICATION_STAGES.indexOf(application.stage) + 1];
  const activeIntent = navigation.formData?.get("intent");
  const changingStage = activeIntent === "change-application-stage";
  const stageChangeIntent = navigation.formData?.get("changeIntent");
  const advancingStage = changingStage && stageChangeIntent === "advance";
  const correctingStage = changingStage && stageChangeIntent === "correction";
  const creatingAction = activeIntent === "create-next-action";
  const planningRelationship = activeIntent === "plan-relationship";
  const decidingRecommendation =
    activeIntent === "accept-recommendation" || activeIntent === "dismiss-recommendation";
  const feedbackIntent = actionData?.intent;

  return (
    <div className="page">
      <PageHeader
        title={title}
        description={opportunity?.companyName ?? "The original listing snapshot is unavailable."}
      />
      <Panel as="section" className="application-overview" padding="comfortable">
        <div>
          <h2>Application</h2>
          <div className="record-stamps">
            <span className="ats-badge">{titleCase(application.stage)}</span>
            {opportunity ? (
              <span className={opportunity.listingIsActive ? "verified-tag" : "lead-tag"}>
                {opportunity.listingIsActive ? "Listing current" : "Listing closed"}
              </span>
            ) : null}
          </div>
        </div>
        {nextStage ? (
          <Form method="post">
            <input name="intent" type="hidden" value="change-application-stage" />
            <input name="applicationId" type="hidden" value={application.id} />
            <input name="stage" type="hidden" value={nextStage} />
            <input name="changeIntent" type="hidden" value="advance" />
            <p aria-live="polite" role={actionData?.ok === false ? "alert" : "status"}>
              {advancingStage
                ? "Changing Application stage."
                : feedbackIntent === "change-application-stage" &&
                    actionData?.changeIntent === "advance"
                  ? actionData?.message
                  : null}
            </p>
            <Button busy={advancingStage} type="submit">
              {advancingStage ? "Changing stage" : `Move to ${titleCase(nextStage)}`}
            </Button>
          </Form>
        ) : null}
        <Form method="post">
          <input name="intent" type="hidden" value="change-application-stage" />
          <input name="applicationId" type="hidden" value={application.id} />
          <input name="changeIntent" type="hidden" value="correction" />
          <SelectField
            key={application.stage}
            id="correct-application-stage"
            label="Correct Application stage"
            name="stage"
            defaultValue={application.stage}
          >
            {APPLICATION_STAGES.map((stage) => (
              <option key={stage} value={stage}>
                {titleCase(stage)}
              </option>
            ))}
          </SelectField>
          <p aria-live="polite" role={actionData?.ok === false ? "alert" : "status"}>
            {correctingStage
              ? "Changing Application stage."
              : feedbackIntent === "change-application-stage" &&
                  actionData?.changeIntent === "correction"
                ? actionData?.message
                : null}
          </p>
          <Button busy={correctingStage} type="submit">
            Correct stage
          </Button>
        </Form>
      </Panel>
      <section className="workflow-section" aria-labelledby="next-actions-heading">
        <SectionHeader
          id="next-actions-heading"
          title="Next actions"
          description="Committed work you have created or accepted."
        />
        {nextActions.length === 0 ? (
          <Panel as="article" className="empty-state compact" padding="comfortable">
            <h3>No Next actions yet</h3>
            <p>Create one below or accept an Advisor Recommendation.</p>
          </Panel>
        ) : (
          <div className="workflow-card-grid">
            {nextActions.map((action) => (
              <Card as="article" className="workflow-card" key={action.id} tone="outlined">
                <div>
                  <h3>{action.title}</h3>
                  <p>{action.reason}</p>
                </div>
                <div className="workflow-card-actions">
                  <span className="ats-badge">{titleCase(action.state)} Next action</span>
                  <p aria-live="polite" role={actionData?.ok === false ? "alert" : "status"}>
                    {activeIntent === "change-next-action" &&
                    navigation.formData?.get("actionId") === String(action.id)
                      ? "Saving Next action change."
                      : feedbackIntent === "change-next-action" &&
                          actionData?.actionId === String(action.id)
                        ? actionData.message
                        : null}
                  </p>
                  <Form method="post" className="empty-actions">
                    <input name="intent" type="hidden" value="change-next-action" />
                    <input name="actionId" type="hidden" value={action.id} />
                    {(action.state === "open" ? ["complete", "dismiss"] : ["reopen"]).map(
                      (changeKind) => (
                        <Button
                          key={changeKind}
                          name="changeKind"
                          value={changeKind}
                          type="submit"
                          busy={
                            activeIntent === "change-next-action" &&
                            navigation.formData?.get("actionId") === String(action.id) &&
                            navigation.formData?.get("changeKind") === changeKind
                          }
                        >
                          {titleCase(changeKind)}
                        </Button>
                      ),
                    )}
                  </Form>
                  {action.state === "open" ? (
                    <Form method="post">
                      <input name="intent" type="hidden" value="change-next-action" />
                      <input name="actionId" type="hidden" value={action.id} />
                      <input name="changeKind" type="hidden" value="defer" />
                      <TextField
                        id={`defer-action-${action.id}`}
                        label="Defer until"
                        name="dueAt"
                        type="datetime-local"
                        required
                      />
                      <Button
                        type="submit"
                        busy={
                          activeIntent === "change-next-action" &&
                          navigation.formData?.get("actionId") === String(action.id) &&
                          navigation.formData?.get("changeKind") === "defer"
                        }
                      >
                        Defer
                      </Button>
                    </Form>
                  ) : null}
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section className="workflow-section" aria-labelledby="add-next-action-heading">
        <SectionHeader
          id="add-next-action-heading"
          title="Add a Next action"
          description="Use this for work you decide yourself."
        />
        <Form {...controlRowAttributes(3)} method="post">
          <input name="intent" type="hidden" value="create-next-action" />
          <input name="applicationId" type="hidden" value={application.id} />
          <TextField id="new-next-action" label="New Next action" name="title" required />
          <TextField
            id="new-next-action-reason"
            label="New Next action reason"
            name="reason"
            required
          />
          <TextField
            hint="Optional. Use your local date and time."
            id="new-next-action-due-at"
            label="New Next action due time"
            name="dueAt"
            type="datetime-local"
          />
          <Button busy={creatingAction} type="submit">
            {creatingAction ? "Adding Next action" : "Add Next action"}
          </Button>
        </Form>
        <p aria-live="polite" role={actionData?.ok === false ? "alert" : "status"}>
          {creatingAction
            ? "Adding Next action."
            : feedbackIntent === "create-next-action"
              ? actionData?.message
              : null}
        </p>
      </section>
      <section className="workflow-section" aria-labelledby="relationship-plan-heading">
        <SectionHeader
          id="relationship-plan-heading"
          title="Relationship plan"
          description="Evidence-backed ways to build a credible human path for this Application."
          actions={
            advisorEnabled ? (
              <Form method="post">
                <input name="intent" type="hidden" value="plan-relationship" />
                <input name="applicationId" type="hidden" value={application.id} />
                <p aria-live="polite" role={actionData?.ok === false ? "alert" : "status"}>
                  {planningRelationship
                    ? "Planning a relationship path with the local Advisor."
                    : feedbackIntent === "plan-relationship"
                      ? actionData?.message
                      : null}
                </p>
                <Button busy={planningRelationship} type="submit">
                  {planningRelationship ? "Planning Relationship" : "Request Relationship plan"}
                </Button>
              </Form>
            ) : (
              <Link {...buttonAttributes("primary")} to="/settings/opportunities">
                Enable Advisor in Settings
              </Link>
            )
          }
        />

        {latestExecution &&
        latestExecution.status !== "completed" &&
        (!relationshipPlan ||
          latestExecution.startedAt.getTime() >= relationshipPlan.createdAt.getTime()) ? (
          <Panel as="article" padding="comfortable">
            <h3>Latest Advisor attempt: {latestExecution.status}</h3>
            <p>Started: {latestExecution.startedAt.toISOString()}</p>
            {latestExecution.reason ? <p>{latestExecution.reason}</p> : null}
            {relationshipPlan ? (
              <p>The saved Relationship plan below is from an earlier successful attempt.</p>
            ) : null}
          </Panel>
        ) : null}
        {relationshipPlan ? (
          <Panel as="article" padding="comfortable">
            <h3>Plan summary</h3>
            <p>{relationshipPlan.summary}</p>
            {relationshipPlan.prospectReferences.length > 0 ? (
              <>
                <h3>Existing Prospects</h3>
                <ul>
                  {relationshipPlan.prospectReferences.map((prospect) => (
                    <li key={`${prospect.shortlistId}:${prospect.recruiterId}`}>
                      <p>{prospect.reason}</p>
                      <ul>
                        {prospect.evidenceUrls.map((sourceUrl) => (
                          <li key={sourceUrl}>
                            <a href={sourceUrl} rel="noreferrer" target="_blank">
                              Open Prospect Evidence
                            </a>
                          </li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            {relationshipPlan.publicPeople.length > 0 ? (
              <>
                <h3>Public people</h3>
                <ul>
                  {relationshipPlan.publicPeople.map((person) => (
                    <li key={person.profileUrl}>
                      <a href={person.profileUrl} rel="noreferrer" target="_blank">
                        {person.name}, {person.title} at {person.companyName}
                      </a>
                      <p>{person.reason}</p>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
            <p>
              Evidence cutoff: {relationshipPlan.evidenceCutoff.toISOString()} · Model:{" "}
              {relationshipPlan.model} · Created: {relationshipPlan.createdAt.toISOString()} ·
              Reasoning effort: {relationshipPlan.reasoningEffort} · Policy version:{" "}
              {relationshipPlan.policyVersion} · Schema version: {relationshipPlan.schemaVersion}
            </p>
          </Panel>
        ) : (
          <Panel as="article" padding="comfortable">
            <h3>No Relationship plan yet</h3>
            <p>Request one when you want an evidence-backed route to relevant people.</p>
          </Panel>
        )}
        {recommendations.length > 0 ? (
          <>
            <SectionHeader
              title="Recommendations"
              description="Proposals stay separate until you accept one as a Next action."
            />
            <div className="workflow-card-grid">
              {recommendations.map((recommendation) => (
                <Card
                  as="article"
                  className="workflow-card"
                  key={recommendation.id}
                  tone="outlined"
                >
                  <div>
                    <h3>{recommendation.title}</h3>
                    <p>{recommendation.reason}</p>
                    <ul>
                      {recommendation.evidenceUrls.map((sourceUrl) => (
                        <li key={sourceUrl}>
                          <a href={sourceUrl} rel="noreferrer" target="_blank">
                            Review cited evidence
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="workflow-card-actions">
                    <p>Recommendation · {titleCase(recommendation.state)}</p>
                    <p
                      aria-live="polite"
                      role={
                        actionData?.ok === false &&
                        actionData?.recommendationId === String(recommendation.id)
                          ? "alert"
                          : "status"
                      }
                    >
                      {decidingRecommendation &&
                      navigation.formData?.get("recommendationId") === String(recommendation.id)
                        ? "Saving your Recommendation decision."
                        : (feedbackIntent === "accept-recommendation" ||
                              feedbackIntent === "dismiss-recommendation") &&
                            actionData?.recommendationId === String(recommendation.id)
                          ? actionData?.message
                          : null}
                    </p>
                    {recommendation.state === "proposed" ? (
                      <div className="empty-actions">
                        <Form method="post">
                          <input name="intent" type="hidden" value="accept-recommendation" />
                          <input name="applicationId" type="hidden" value={application.id} />
                          <input name="recommendationId" type="hidden" value={recommendation.id} />
                          <input name="dueAt" type="hidden" value="" />
                          <Button
                            busy={
                              activeIntent === "accept-recommendation" &&
                              navigation.formData?.get("recommendationId") ===
                                String(recommendation.id)
                            }
                            type="submit"
                            variant="primary"
                          >
                            Accept as Next action
                          </Button>
                        </Form>
                        <Form method="post">
                          <input name="intent" type="hidden" value="dismiss-recommendation" />
                          <input name="applicationId" type="hidden" value={application.id} />
                          <input name="recommendationId" type="hidden" value={recommendation.id} />
                          <Button
                            busy={
                              activeIntent === "dismiss-recommendation" &&
                              navigation.formData?.get("recommendationId") ===
                                String(recommendation.id)
                            }
                            type="submit"
                          >
                            Dismiss
                          </Button>
                        </Form>
                      </div>
                    ) : recommendation.state === "accepted" ? (
                      <p>Accepted as a Next action.</p>
                    ) : (
                      <p>Dismissed. No Application facts changed.</p>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          </>
        ) : null}
      </section>
      <Panel as="section" padding="comfortable">
        <h2>Application timeline</h2>
        <ol>
          {timeline.map((entry) => (
            <li key={entry.id}>{timelineLabel(entry.kind)}</li>
          ))}
        </ol>
      </Panel>
    </div>
  );
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function timelineLabel(kind: string): string {
  return kind === "application-started"
    ? "Application started"
    : kind.replaceAll("-", " ").replace(/^./, (value) => value.toUpperCase());
}
