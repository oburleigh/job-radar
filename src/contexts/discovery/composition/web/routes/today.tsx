import { Card, PageHeader, Panel } from "@job-radar/design-ui";
import { Link, redirect, useLoaderData } from "react-router";

import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import { loadActivityData } from "@/contexts/discovery/composition/web/activity-data.server";
import { discoveryOpportunityContract } from "@/contexts/discovery/public-contract.server";
import { opportunityTrackingContract } from "@/contexts/opportunity-tracking/public-contract.server";

export async function loader({ request }: { readonly request: Request }) {
  const url = new URL(request.url);
  if (url.search) {
    throw redirect(`/opportunities${url.search}`);
  }
  let applications: ReturnType<typeof opportunityTrackingContract.listApplications> = [];
  let applicationsError: string | null = null;
  try {
    applications = opportunityTrackingContract.listApplications();
  } catch {
    applicationsError = "Applications could not load. Refresh to try again.";
  }
  let actions: (ReturnType<typeof opportunityTrackingContract.listTodayActions>[number] & {
    opportunity: ReturnType<typeof discoveryOpportunityContract.getOpportunitySnapshot>;
  })[] = [];
  let actionsError: string | null = null;
  let totalActions = 0;
  try {
    const orderedActions = opportunityTrackingContract.listTodayActions(new Date());
    totalActions = orderedActions.length;
    actions = orderedActions
      .slice(0, discoveryWeb.getUiSettings().todayNextActionLimit)
      .map((action) => {
        const application = applications.find((candidate) => candidate.id === action.applicationId);
        let opportunity = null;
        try {
          opportunity = application
            ? discoveryOpportunityContract.getOpportunitySnapshot(application)
            : null;
        } catch {
          // The owning Application link remains usable without its listing snapshot.
        }
        return {
          ...action,
          opportunity,
        };
      });
  } catch {
    actionsError = "Next actions could not load. Refresh to try again.";
  }
  let opportunities: ReturnType<typeof discoveryOpportunityContract.listRankedOpportunities> = [];
  let opportunitiesError: string | null = null;
  try {
    opportunities = discoveryOpportunityContract
      .listRankedOpportunities()
      .filter(
        (opportunity) =>
          !applications.some(
            (application) =>
              application.searchProfileId === opportunity.searchProfileId &&
              application.jobListingId === opportunity.jobListingId,
          ),
      );
  } catch {
    opportunitiesError = "Priority Opportunities could not load. Refresh to try again.";
  }
  const systemStatus = await loadActivityData().catch(() => ({
    items: [],
    errors: ["System status could not load."],
  }));
  return {
    totalActions,
    pipeline: applicationsError
      ? []
      : opportunityTrackingContract.applicationStages.map((stage) => ({
          stage,
          count: applications.filter((application) => application.stage === stage).length,
          href: `/applications?stage=${stage}`,
        })),
    systemStatus,
    actions,
    actionsError,
    opportunities,
    opportunitiesError,
    applicationsError,
    applications: applications.map((application) => {
      let opportunity = null;
      try {
        opportunity = discoveryOpportunityContract.getOpportunitySnapshot(application);
      } catch {
        /* The retained Application remains available. */
      }
      return { ...application, opportunity };
    }),
  };
}

export default function TodayPage() {
  const {
    actions,
    totalActions,
    pipeline,
    systemStatus,
    actionsError,
    opportunities,
    opportunitiesError,
    applications,
    applicationsError,
  } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <PageHeader title="Today" description="The next work that can move your search forward." />
      {actionsError ? (
        <p role="alert">
          {actionsError} <Link to="/">Refresh Today</Link>
        </p>
      ) : actions.length === 0 ? (
        <Panel as="section" className="empty-state compact" padding="comfortable">
          <h2>No Next actions yet</h2>
          <p>Start an Application from an Opportunity to add its first Next action.</p>
        </Panel>
      ) : (
        <section aria-labelledby="next-actions-heading">
          <h2 id="next-actions-heading">Next actions</h2>
          <p>
            Showing {actions.length} of {totalActions} open Next actions.{" "}
            <Link to="/applications">View Applications</Link>
          </p>
          <div className="job-grid">
            {actions.map((action) => (
              <Panel as="article" key={action.id} padding="comfortable">
                <h3>{action.title}</h3>
                <p>{action.reason}</p>
                <p>
                  {action.dueAt ? (
                    <>
                      Due{" "}
                      <time dateTime={action.dueAt.toISOString()}>
                        {action.dueAt.toLocaleString()}
                      </time>
                    </>
                  ) : (
                    "No due date"
                  )}
                </p>
                <p>
                  {action.opportunity
                    ? `${action.opportunity.title} at ${action.opportunity.companyName}`
                    : `Application ${action.applicationId}`}
                </p>
                <Link to={`/applications/${action.applicationId}`}>Open Application</Link>
              </Panel>
            ))}
          </div>
        </section>
      )}
      <section aria-labelledby="priority-opportunities-heading">
        <h2 id="priority-opportunities-heading">Priority Opportunities</h2>
        <p>Matches awaiting your decision, ordered by Match score and listing date.</p>
        {applicationsError && !opportunitiesError ? (
          <p role="alert">Opportunities may include roles you are already pursuing.</p>
        ) : null}
        {opportunitiesError ? (
          <p role="alert">
            {opportunitiesError} <Link to="/">Refresh Today</Link>
          </p>
        ) : opportunities.length === 0 ? (
          <p>
            No Opportunities awaiting a decision.{" "}
            <Link to="/opportunities">Review Opportunities</Link>
          </p>
        ) : (
          <div className="job-grid">
            {opportunities.map((opportunity) => (
              <Card key={`${opportunity.searchProfileId}:${opportunity.jobListingId}`}>
                <h3>
                  <Link
                    to={`/opportunities/${opportunity.searchProfileId}/${opportunity.jobListingId}`}
                  >
                    {opportunity.title}
                  </Link>
                </h3>
                <p>
                  {opportunity.companyName} · {opportunity.locationText}
                </p>
                <p>Match score: {opportunity.matchScore}</p>
              </Card>
            ))}
          </div>
        )}
      </section>
      <section aria-labelledby="applications-heading">
        <h2 id="applications-heading">Applications</h2>
        {!applicationsError ? (
          <nav aria-label="Application pipeline" className="empty-actions">
            {pipeline.map((entry) => (
              <Link key={entry.stage} to={entry.href}>
                {entry.stage.slice(0, 1).toUpperCase()}
                {entry.stage.slice(1)} ({entry.count})
              </Link>
            ))}
          </nav>
        ) : null}
        {applicationsError ? (
          <p role="alert">
            {applicationsError} <Link to="/">Refresh Today</Link>
          </p>
        ) : applications.length === 0 ? (
          <p>
            No Applications yet. <Link to="/opportunities">Review Opportunities</Link>
          </p>
        ) : (
          <div className="job-grid">
            {applications.map((application) => (
              <Card key={application.id}>
                <h3>
                  <Link to={`/applications/${application.id}`}>
                    {application.opportunity?.title ?? `Application ${application.id}`}
                  </Link>
                </h3>
                <p>{application.opportunity?.companyName ?? "Listing snapshot unavailable"}</p>
                <p>
                  Application stage: {application.stage.slice(0, 1).toUpperCase()}
                  {application.stage.slice(1)}
                </p>
              </Card>
            ))}
          </div>
        )}
      </section>
      <Panel as="section" padding="comfortable" aria-labelledby="system-status-heading">
        <h2 id="system-status-heading">System status</h2>
        {systemStatus.errors.map((message) => (
          <p key={message} role="alert">
            {message}
          </p>
        ))}
        {systemStatus.items.length > 0 ? (
          <>
            <p>
              In retained run history: {systemStatus.items.filter((item) => item.active).length}{" "}
              running ·{" "}
              {
                systemStatus.items.filter(
                  (item) => item.tone === "failed" || item.tone === "partial",
                ).length
              }{" "}
              needing attention.
            </p>
            {systemStatus.items.slice(0, 1).map((item) => (
              <p key={`${item.kind}-${item.id}`}>
                Latest:{" "}
                <Link to={item.href}>
                  {item.type} · {item.status}
                </Link>
              </p>
            ))}
          </>
        ) : systemStatus.errors.length === 0 ? (
          <p>No runs recorded.</p>
        ) : null}
        <Link to="/activity">View Activity</Link>
      </Panel>
    </div>
  );
}
