import { Bookmark, BriefcaseBusiness, CheckCircle2, Radar, Waypoints } from "lucide-react";
import Link from "next/link";
import { PageHeader } from "@/app/_components/page-header";
import type { AtsType } from "@/contexts/discovery/adapters/driven/job-sources/ats-integration";
import { getAtsLabels } from "@/contexts/discovery/adapters/driven/job-sources/catalog";
import { getSearchProviderOptions } from "@/contexts/discovery/adapters/driven/search/web-search-provider";
import {
  getDashboardData,
  type JobState,
} from "@/contexts/discovery/adapters/driven/sqlite/read-models/dashboard";
import { JobCard } from "@/contexts/discovery/adapters/driving/web/job-card";
import { JobFilters } from "@/contexts/discovery/adapters/driving/web/job-filters";
import { RunControls } from "@/contexts/discovery/adapters/driving/web/run-controls";

export const dynamic = "force-dynamic";

interface JobsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function JobsPage({ searchParams }: JobsPageProps) {
  const params = await searchParams;
  const atsLabels = getAtsLabels();
  const profileId = positiveInteger(single(params.profile));
  const atsType = validAtsType(single(params.ats), atsLabels);
  const state = validState(single(params.state));
  const query = single(params.q);
  const data = getDashboardData({
    ...(profileId ? { profileId } : {}),
    ...(atsType ? { atsType } : {}),
    ...(state ? { state } : {}),
    ...(query ? { query } : {}),
  });
  const searchProviders = getSearchProviderOptions();

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
                  job={{ ...job, state: job.state as JobState }}
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
                  href={`/profiles?profile=${data.profile.id}`}
                >
                  Review profile
                </Link>
                <Link className="button button-secondary" href="/sources">
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
          <Link className="button button-primary" href="/profiles">
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

function single(value: string | string[] | undefined): string {
  return Array.isArray(value) ? (value[0] ?? "") : (value ?? "");
}

function positiveInteger(value: string): number | undefined {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function validAtsType(value: string, labels: Record<string, string>): AtsType | undefined {
  return value in labels ? value : undefined;
}

function validState(value: string): JobState | "all" | undefined {
  return ["all", "new", "saved", "applied", "hidden"].includes(value)
    ? (value as JobState | "all")
    : undefined;
}
