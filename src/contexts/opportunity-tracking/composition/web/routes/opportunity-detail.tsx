import {
  Button,
  buttonAttributes,
  Card,
  PageHeader,
  Panel,
  SectionHeader,
} from "@job-radar/design-ui";
import { Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";

import { discoveryOpportunityContract } from "@/contexts/discovery/public-contract.server";
import { opportunityAdvisor } from "@/contexts/opportunity-tracking/composition/advisor.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader({ params }: { readonly params: Record<string, string | undefined> }) {
  const reference = opportunityReference(params);
  const opportunity = discoveryOpportunityContract.getOpportunitySnapshot(reference);
  if (!opportunity) throw new Response("Opportunity not found.", { status: 404 });
  return {
    opportunity,
    applicationStartAvailable:
      discoveryOpportunityContract.findRankedOpportunity(reference) !== null,
    assessment: opportunityAdvisor.latestAssessment(reference) ?? null,
    latestExecution:
      opportunityAdvisor.latestExecution({
        ...reference,
        kind: "assessment",
        applicationId: null,
      }) ?? null,
    advisorEnabled: opportunityAdvisor.policy().enabled,
  };
}

export async function action({
  params,
  request,
}: {
  readonly params: Record<string, string | undefined>;
  readonly request: Request;
}) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  if (formData.get("intent") !== "assess-opportunity") {
    return { ok: false as const, message: "Unknown Opportunity action." };
  }
  const reference = opportunityReference(params);
  const opportunity = discoveryOpportunityContract.findRankedOpportunity(reference);
  if (!opportunity) return { ok: false as const, message: "Opportunity is no longer assessable." };
  const result = await opportunityAdvisor.assess(opportunity, request.signal);
  if (result.status === "completed") {
    return { ok: true as const, message: "Opportunity assessment completed." };
  }
  if (result.status === "disabled") {
    return { ok: false as const, message: "Advisor is disabled in Settings." };
  }
  if (result.status === "rejected") {
    return { ok: false as const, message: "Advisor reply failed evidence validation." };
  }
  return { ok: false as const, message: `Advisor failed: ${result.message}` };
}

export default function OpportunityDetailPage() {
  const { advisorEnabled, applicationStartAvailable, assessment, latestExecution, opportunity } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const assessing = navigation.formData?.get("intent") === "assess-opportunity";

  return (
    <div className="page">
      <PageHeader
        title={opportunity.title}
        description={opportunity.companyName}
        actions={
          applicationStartAvailable ? (
            <Link
              {...buttonAttributes("primary")}
              to={`/applications/new?searchProfileId=${opportunity.searchProfileId}&jobListingId=${opportunity.jobListingId}`}
            >
              Start Application
            </Link>
          ) : undefined
        }
      />
      <Panel as="section" padding="comfortable">
        <h2>Opportunity facts</h2>
        <dl className="opportunity-facts">
          <div>
            <dt>Location</dt>
            <dd>{opportunity.locationText}</dd>
          </div>
          <div>
            <dt>Match score</dt>
            <dd>{opportunity.matchScore}</dd>
          </div>
          <div>
            <dt>Listing evidence</dt>
            <dd>{opportunity.verified ? "Verified listing" : "Unverified search lead"}</dd>
          </div>
        </dl>
        <a href={opportunity.canonicalUrl} rel="noreferrer" target="_blank">
          Open the original listing
        </a>
      </Panel>
      <section aria-labelledby="opportunity-assessment-heading">
        <SectionHeader
          id="opportunity-assessment-heading"
          title="Opportunity assessment"
          description="Advisor interpretation stays separate from the Match facts above."
          actions={
            advisorEnabled ? (
              <Form method="post">
                <input name="intent" type="hidden" value="assess-opportunity" />
                <p aria-live="polite" role={actionData?.ok === false ? "alert" : "status"}>
                  {assessing
                    ? "Assessing Opportunity with the local Advisor."
                    : actionData?.message}
                </p>
                <Button busy={assessing} type="submit">
                  {assessing ? "Assessing Opportunity" : "Request assessment"}
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
        (!assessment || latestExecution.startedAt.getTime() >= assessment.createdAt.getTime()) ? (
          <Panel as="article" padding="comfortable">
            <h3>Latest Advisor attempt: {latestExecution.status}</h3>
            <p>Started: {latestExecution.startedAt.toISOString()}</p>
            {latestExecution.reason ? <p>{latestExecution.reason}</p> : null}
            {assessment ? (
              <p>The saved Opportunity assessment below is from an earlier successful attempt.</p>
            ) : null}
          </Panel>
        ) : null}
        {assessment ? (
          <>
            <Panel as="article" className="assessment-panel" padding="comfortable">
              <div className="assessment-grid">
                <section className="assessment-summary">
                  <h3>Advisor summary</h3>
                  <p>{assessment.summary.text}</p>
                  <StatementEvidence urls={assessment.summary.evidenceUrls} />
                </section>
                <section>
                  <h3>Strengths</h3>
                  <ul>
                    {assessment.strengths.map((item) => (
                      <li key={item.text}>
                        {item.text}
                        <StatementEvidence urls={item.evidenceUrls} />
                      </li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h3>Gaps to resolve</h3>
                  <ul>
                    {assessment.gaps.map((item) => (
                      <li key={item.text}>
                        {item.text}
                        <StatementEvidence urls={item.evidenceUrls} />
                      </li>
                    ))}
                  </ul>
                </section>
                <section className="assessment-evidence">
                  <h3>Evidence</h3>
                  <ul>
                    {assessment.evidence.map((item) => (
                      <li key={`${item.sourceUrl}:${item.excerpt}`}>
                        <p>{item.excerpt}</p>
                        <a href={item.sourceUrl} rel="noreferrer" target="_blank">
                          Open supporting evidence
                        </a>
                      </li>
                    ))}
                  </ul>
                </section>
                <p className="assessment-metadata">
                  Evidence cutoff: {assessment.evidenceCutoff.toISOString()} · Model:{" "}
                  {assessment.model} · Created: {assessment.createdAt.toISOString()} · Reasoning
                  effort: {assessment.reasoningEffort} · Policy version: {assessment.policyVersion}{" "}
                  · Schema version: {assessment.schemaVersion}
                </p>
              </div>
            </Panel>
            <SectionHeader
              title="Recommendations"
              description="These are proposals. Starting an Application does not accept them automatically."
            />
            <div className="job-grid">
              {assessment.recommendations.map((recommendation) => (
                <Card
                  as="article"
                  key={`${recommendation.title}:${recommendation.reason}`}
                  tone="outlined"
                >
                  <h3>{recommendation.title}</h3>
                  <p>{recommendation.reason}</p>
                  <p>Recommendation · Proposed</p>
                  <ul>
                    {recommendation.evidenceUrls.map((sourceUrl) => (
                      <li key={sourceUrl}>
                        <a href={sourceUrl} rel="noreferrer" target="_blank">
                          Review cited evidence
                        </a>
                      </li>
                    ))}
                  </ul>
                </Card>
              ))}
            </div>
          </>
        ) : (
          <Panel as="article" padding="comfortable">
            <h3>No Opportunity assessment yet</h3>
            <p>
              The Match facts remain available. Request an assessment when you want Advisor context.
            </p>
          </Panel>
        )}
      </section>
      <Panel as="section" padding="comfortable" aria-labelledby="job-description-heading">
        <h2 id="job-description-heading">Job description</h2>
        {opportunity.description.trim() ? (
          <p>{opportunity.description}</p>
        ) : (
          <p>
            This listing has no job description. Open the original listing and refresh it through
            Discovery before requesting an assessment.
          </p>
        )}
        <h3>Search profile criteria</h3>
        <p>Target roles: {opportunity.searchCriteria.titleTerms.join(", ") || "Not specified"}.</p>
        <p>Locations: {opportunity.searchCriteria.locationTerms.join(", ") || "Not specified"}.</p>
        <p>
          Required job terms: {opportunity.searchCriteria.requiredJobTerms.join(", ") || "None"}.
        </p>
        <p>
          These are your search preferences. They do not describe your experience or qualifications.
        </p>
      </Panel>
    </div>
  );
}

function opportunityReference(params: Record<string, string | undefined>) {
  const searchProfileId = Number(params.searchProfileId);
  const jobListingId = Number(params.jobListingId);
  if (!Number.isSafeInteger(searchProfileId) || searchProfileId <= 0) {
    throw new Response("Opportunity not found.", { status: 404 });
  }
  if (!Number.isSafeInteger(jobListingId) || jobListingId <= 0) {
    throw new Response("Opportunity not found.", { status: 404 });
  }
  return { searchProfileId, jobListingId };
}

function StatementEvidence({ urls }: { readonly urls: readonly string[] }) {
  return (
    <ul>
      {urls.map((url) => (
        <li key={url}>
          <a href={url} rel="noreferrer" target="_blank">
            Open supporting evidence
          </a>
        </li>
      ))}
    </ul>
  );
}
