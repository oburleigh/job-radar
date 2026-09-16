import {
  Button,
  buttonAttributes,
  Card,
  controlRowAttributes,
  PageHeader,
  Panel,
  SelectField,
} from "@job-radar/design-ui";
import { Form, Link, useLoaderData } from "react-router";

import { discoveryOpportunityContract } from "@/contexts/discovery/public-contract.server";
import {
  APPLICATION_STAGES,
  type ApplicationStage,
} from "@/contexts/opportunity-tracking/domain/application-stage";
import { opportunityTrackingContract } from "@/contexts/opportunity-tracking/public-contract.server";

export function loader({ request }: { readonly request: Request }) {
  const requestedStage = new URL(request.url).searchParams.get("stage");
  const stage = isApplicationStage(requestedStage) ? requestedStage : undefined;
  const records = opportunityTrackingContract
    .listApplications()
    .filter((application) => !stage || application.stage === stage);
  return {
    stage,
    applications: records.map((application) => ({
      application,
      opportunity: discoveryOpportunityContract.getOpportunitySnapshot(application),
    })),
  };
}

export default function ApplicationsPage() {
  const { applications, stage } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <PageHeader
        title="Applications"
        description="Track each active pursuit and its next committed step."
      />
      <Form {...controlRowAttributes(2)} aria-label="Filter Applications" method="get">
        <SelectField
          id="application-stage-filter"
          label="Application stage"
          name="stage"
          defaultValue={stage ?? "all"}
        >
          <option value="all">All stages</option>
          {APPLICATION_STAGES.map((value) => (
            <option key={value} value={value}>
              {titleCase(value)}
            </option>
          ))}
        </SelectField>
        <Button type="submit">Filter Applications</Button>
      </Form>
      {applications.length === 0 ? (
        <Panel as="section" className="empty-state compact" padding="comfortable">
          <h2>{stage ? "No Applications at this stage." : "No Applications yet"}</h2>
          <p>
            {stage
              ? "Choose another stage or show every Application."
              : "Start from an Opportunity when you decide to pursue it."}
          </p>
          <Link {...buttonAttributes("primary")} to="/opportunities">
            Review Opportunities
          </Link>
        </Panel>
      ) : (
        <section className="job-grid" aria-label="Applications">
          {applications.map(({ application, opportunity }) => (
            <Card key={application.id}>
              <h2>
                <Link to={`/applications/${application.id}`}>
                  {opportunity?.title ?? `Application ${application.id}`}
                </Link>
              </h2>
              <p>{opportunity?.companyName ?? "Listing snapshot unavailable"}</p>
              <p>Application stage: {titleCase(application.stage)}</p>
            </Card>
          ))}
        </section>
      )}
    </div>
  );
}

function titleCase(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

function isApplicationStage(value: string | null): value is ApplicationStage {
  return APPLICATION_STAGES.some((stage) => stage === value);
}
