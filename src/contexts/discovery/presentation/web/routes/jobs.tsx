import { JobCard, JobFilters, RunControls } from "@job-radar/discovery-ui";
import { PageHeader } from "@job-radar/ui";
import { Bookmark, BriefcaseBusiness, CheckCircle2, Radar, Waypoints } from "lucide-react";
import { type ActionFunctionArgs, Link, useLoaderData } from "react-router";
import {
  isJobListingState,
  type JobListingState,
} from "@/contexts/discovery/domain/job-listing-state";
import { assertLocalHost } from "@/platform/http/require-local-request";
import { discoveryWeb } from "../../../composition/discovery-web.server";

export function loader({ request }: { readonly request: Request }) {
  const searchParams = new URL(request.url).searchParams;
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
  return { atsLabels, dashboard, searchProviders: discoveryWeb.getSearchProviderOptions() };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  if (formData.get("intent") !== "update-job-state") {
    return { ok: false, message: "Unknown opportunity action." };
  }
  discoveryWeb.changeJobListingState({
    profileId: Number(formData.get("profileId")),
    jobId: Number(formData.get("jobId")),
    state: String(formData.get("status")) as JobListingState,
  });
  return { ok: true, message: "Job status updated." };
}

export default function JobsPage() {
  const { atsLabels, dashboard: data, searchProviders } = useLoaderData<typeof loader>();

  return (
    <div className="page">
      <PageHeader
        index="01"
        title="The roles worth your attention"
        description="Search widely, then use explicit rules to keep the shortlist focused."
        actions={
          data.profile ? (
            <RunControls profileId={data.profile.id} providers={searchProviders} />
          ) : null
        }
      />

      {data.profile ? (
        <>
          <section className="metric-grid" aria-label="Opportunity index summary">
            <Metric
              icon={<BriefcaseBusiness size={19} />}
              label="Matched roles"
              value={data.counts.matched}
              detail={`${data.counts.new} need review`}
            />
            <Metric
              icon={<Bookmark size={19} />}
              label="Saved"
              value={data.counts.saved}
              detail="Personal shortlist"
            />
            <Metric
              icon={<CheckCircle2 size={19} />}
              label="Applied"
              value={data.counts.applied}
              detail="Application tracker"
            />
            <Metric
              icon={<Waypoints size={19} />}
              label="Active coverage"
              value={data.activeSources}
              detail={`${data.activeBoards} known company boards`}
            />
          </section>

          <JobFilters
            profiles={data.profiles}
            currentProfileId={data.profile.id}
            atsLabels={atsLabels}
          />

          <div className="catalogue-heading">
            <div className="heading-with-index">
              <span className="section-index" aria-hidden="true">
                04
              </span>
              <h2>{data.profile.name}</h2>
            </div>
            <div className="catalogue-count">
              <strong>{data.jobs.length}</strong>
              <span>role{data.jobs.length === 1 ? "" : "s"} shown</span>
            </div>
          </div>

          <ScreeningSummary screened={data.screened} />

          {data.jobs.length > 0 ? (
            <section className="job-grid" aria-label="Ranked opportunities">
              {data.jobs.map((job) => (
                <JobCard
                  key={job.id}
                  profileId={data.profile.id}
                  atsLabel={atsLabels[job.atsType] ?? job.atsType}
                  job={{ ...job, state: job.state as JobListingState }}
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
                <Link
                  className="button button-secondary"
                  to={`/profiles?profile=${data.profile.id}`}
                >
                  Review profile
                </Link>
                <Link className="button button-secondary" to="/sources">
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
          <Link className="button button-primary" to="/profiles">
            Create profile
          </Link>
        </section>
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  detail: string;
}) {
  return (
    <article className="metric-card">
      <span className="metric-icon">{icon}</span>
      <div className="metric-copy">
        <span className="metric-label">{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
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
