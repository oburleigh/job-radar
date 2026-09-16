import {
  Button,
  controlRowAttributes,
  PageHeader,
  Panel,
  RadioGroup,
  SectionHeader,
} from "@job-radar/design-ui";
import { useState } from "react";
import { Form, redirect, useActionData, useLoaderData, useNavigation } from "react-router";

import { discoveryOpportunityContract } from "@/contexts/discovery/public-contract.server";
import { createApplicationsAction } from "@/contexts/opportunity-tracking/composition/web/routes/applications-action.server";
import { parseApplicationStartSelection } from "@/contexts/opportunity-tracking/presentation/web/requests/application-start-selection";
import { opportunityTrackingContract } from "@/contexts/opportunity-tracking/public-contract.server";

const startApplication = createApplicationsAction({
  startApplication: opportunityTrackingContract.startApplication,
});

export function loader({ request }: { readonly request: Request }) {
  const selection = parseApplicationStartSelection(new URL(request.url));
  if (!selection.ok) throw new Response("Application start selection is invalid.", { status: 400 });
  const opportunity = discoveryOpportunityContract.findRankedOpportunity(selection);
  if (!opportunity) throw new Response("Opportunity not found.", { status: 404 });
  return { opportunity };
}

export async function action({ request }: { readonly request: Request }) {
  const result = await startApplication(request);
  if (result.ok) throw redirect(`/applications/${result.applicationId}`);
  return result;
}

export default function ApplicationNewPage() {
  const { opportunity } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const [stage, setStage] = useState("preparing");
  const pending = navigation.state === "submitting";

  return (
    <div className="page">
      <PageHeader
        title="Start Application"
        description={`${opportunity.title} at ${opportunity.companyName}`}
      />
      <div className="application-start-layout">
        <Panel as="section" padding="comfortable">
          <h2>Opportunity snapshot</h2>
          <dl className="opportunity-facts">
            <div>
              <dt>Location</dt>
              <dd>{opportunity.locationText}</dd>
            </div>
            <div>
              <dt>Match score</dt>
              <dd>{opportunity.matchScore}</dd>
            </div>
          </dl>
        </Panel>
        <section className="application-start-decision">
          <SectionHeader
            title="Application start"
            description="Choose what is true now. Job Radar adds the useful first step automatically."
          />
          <Form {...controlRowAttributes(1)} method="post">
            <input name="searchProfileId" type="hidden" value={opportunity.searchProfileId} />
            <input name="jobListingId" type="hidden" value={opportunity.jobListingId} />
            <RadioGroup
              id="application-stage"
              legend="Application stage"
              name="stage"
              onChange={setStage}
              options={[
                {
                  label: "Preparing",
                  description: "Adds “Tailor the application” as your first Next action.",
                  value: "preparing",
                },
                {
                  label: "Already Applied",
                  description: "Adds “Plan a follow-up” as your first Next action.",
                  value: "applied",
                },
              ]}
              value={stage}
            />
            <div>
              <p aria-live="polite" role={actionData?.ok === false ? "alert" : "status"}>
                {pending ? "Starting Application." : actionData?.message}
              </p>
              <Button busy={pending} type="submit" variant="primary">
                {pending ? "Starting Application" : "Start Application"}
              </Button>
            </div>
          </Form>
        </section>
      </div>
    </div>
  );
}
