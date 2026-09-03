import { buttonAttributes, PageHeader, SectionHeader } from "@job-radar/design-ui";
import { Radar } from "lucide-react";
import { type ActionFunctionArgs, Link, redirect, useLoaderData } from "react-router";
import { discoveryWeb } from "@/contexts/discovery/composition/discovery-web.server";
import {
  isJobListingState,
  type JobListingState,
} from "@/contexts/discovery/domain/job-listing-state";
import { JobCard } from "@/contexts/discovery/presentation/web/components/job-card";
import { JobFilters } from "@/contexts/discovery/presentation/web/components/job-filters";
import { RunControls } from "@/contexts/discovery/presentation/web/components/run-controls";
import { parseJobListingStateRequest } from "@/contexts/discovery/presentation/web/requests/job-listing-state-request";
import { resolveJobSelection } from "@/contexts/discovery/presentation/web/resolve-job-selection";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader({ request }: { readonly request: Request }) {
  const requestUrl = new URL(request.url);
  const searchParams = requestUrl.searchParams;
  const atsLabels = discoveryWeb.getAtsLabels();
  const profileId = positiveInteger(searchParams.get("profile") ?? "");
  const atsType = validAtsType(searchParams.get("ats") ?? "", atsLabels);
  const state = validState(searchParams.get("state") ?? "");
  const query = searchParams.get("q") ?? "";
  const dashboard = discoveryWeb.getDashboardData({
    ...(profileId ? { profileId } : {}),
    ...(atsType ? { atsType } : {}),
    ...(state ? { state } : {}),
    ...(query ? { query } : {}),
  });
  const searchProviders = discoveryWeb.getSearchProviderOptions();
  requestUrl.pathname = "/";
  const selection = resolveJobSelection(requestUrl, dashboard.profile?.id, searchProviders);
  if (selection.redirectTo) {
    throw redirect(selection.redirectTo);
  }
  return { atsLabels, dashboard, searchProviders, selectedProvider: selection.provider ?? "" };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  if (formData.get("intent") !== "update-job-state") {
    return { ok: false, message: "Unknown opportunity action." };
  }
  const parsed = parseJobListingStateRequest(formData);
  if (!parsed.ok) {
    return parsed;
  }
  discoveryWeb.changeJobListingState(parsed.command);
  return { ok: true, message: "Job status updated." };
}

export default function JobsPage() {
  const {
    atsLabels,
    dashboard: data,
    searchProviders,
    selectedProvider,
  } = useLoaderData<typeof loader>();
  const profile = data.profile;

  return (
    <div className="page">
      <PageHeader
        title="Opportunities"
        description="Review jobs matched to the selected search profile."
      />
      {profile ? (
        <>
          <div className="opportunity-toolbar">
            <RunControls
              profileId={profile.id}
              profiles={data.profiles}
              provider={selectedProvider}
              providers={searchProviders}
              activeSourceCount={data.activeSources}
              activeBoardCount={data.activeBoards}
            />
          </div>

          <JobFilters atsLabels={atsLabels} counts={data.counts} />

          <SectionHeader
            title="Matches"
            actions={
              <div className="catalogue-count">
                <strong>{data.jobs.length}</strong>
                <span>role{data.jobs.length === 1 ? "" : "s"} shown</span>
              </div>
            }
          />

          <ScreeningSummary screened={data.screened} />

          {data.jobs.length > 0 ? (
            <section className="job-grid" aria-label="Ranked opportunities">
              {data.jobs.map((job) => (
                <JobCard
                  key={job.id}
                  profileId={profile.id}
                  atsLabel={atsLabels[job.atsType] ?? job.atsType}
                  job={job}
                />
              ))}
            </section>
          ) : (
            <section className="empty-state">
              <span className="empty-icon">
                <Radar size={29} />
              </span>
              <h2>No matching jobs yet</h2>
              <p>
                No live roles passed this profile. Search-only leads remain excluded unless you
                explicitly allow them in the profile.
              </p>
              <div className="empty-actions">
                <Link {...buttonAttributes()} to={`/profiles?profile=${profile.id}`}>
                  Review profile
                </Link>
                <Link {...buttonAttributes()} to="/settings/adapters/source-coverage">
                  Review sources
                </Link>
              </div>
            </section>
          )}
        </>
      ) : (
        <section className="empty-state">
          <h2>Create a search profile first</h2>
          <p>A profile defines the titles and locations you want to track.</p>
          <Link {...buttonAttributes("primary")} to="/profiles">
            Create profile
          </Link>
        </section>
      )}
    </div>
  );
}

function ScreeningSummary({
  screened,
}: {
  screened: {
    total: number;
    title: number;
    location: number;
    stale: number;
    unverified: number;
    context: number;
    salary: number;
  };
}) {
  if (screened.total === 0) {
    return null;
  }

  return (
    <section className="screening-summary" aria-label="Screening summary">
      <div>
        <span className="screening-index">Profile screen</span>
        <strong>{screened.total} active listings excluded</strong>
      </div>
      <dl>
        <div>
          <dt>Title</dt>
          <dd>{screened.title}</dd>
        </div>
        <div>
          <dt>Location</dt>
          <dd>{screened.location}</dd>
        </div>
        <div>
          <dt>Stale</dt>
          <dd>{screened.stale}</dd>
        </div>
        <div>
          <dt>Unverified</dt>
          <dd>{screened.unverified}</dd>
        </div>
        {screened.context > 0 ? (
          <div>
            <dt>Context</dt>
            <dd>{screened.context}</dd>
          </div>
        ) : null}
        {screened.salary > 0 ? (
          <div>
            <dt>Salary</dt>
            <dd>{screened.salary}</dd>
          </div>
        ) : null}
      </dl>
    </section>
  );
}

function positiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function validAtsType(value: string, labels: Record<string, string>): string | undefined {
  return value in labels ? value : undefined;
}

function validState(value: string): JobListingState | "all" | undefined {
  return value === "all" || isJobListingState(value) ? value : undefined;
}
