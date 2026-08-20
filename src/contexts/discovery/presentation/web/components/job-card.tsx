import { ArrowUpRight, Banknote, Building2, CalendarDays, MapPin } from "lucide-react";

import type { JobListingState } from "@/contexts/discovery/domain/job-listing-state";

import { JobActions } from "./job-actions";

interface JobCardProps {
  profileId: number;
  atsLabel: string;
  job: {
    id: number;
    title: string;
    companyName: string;
    locationText: string;
    atsType: string;
    canonicalUrl: string;
    applyUrl: string;
    department: string;
    employmentType: string;
    workplaceType: string;
    salary: string;
    publishedAt: Date | null;
    firstSeenAt: Date;
    verified: boolean;
    score: number;
    reasons: string[];
    state: JobListingState;
  };
}

export function JobCard({ profileId, atsLabel, job }: JobCardProps) {
  const jobUrl = job.applyUrl || job.canonicalUrl;

  return (
    <article className="job-card">
      <div className="job-record-index" aria-hidden="true" />
      <div className="job-card-heading">
        <div className="record-stamps">
          <span className={job.verified ? "verified-tag" : "lead-tag"}>
            {job.verified ? "Live listing" : "Search lead"}
          </span>
          <span className={`ats-badge ats-${job.atsType}`}>{atsLabel}</span>
        </div>
        <h2>
          <a href={jobUrl} target="_blank" rel="noreferrer">
            {job.title}
            <ArrowUpRight size={17} aria-hidden="true" />
          </a>
        </h2>
        <p>
          <Building2 size={15} aria-hidden="true" />
          {job.companyName || "Company not identified"}
        </p>
      </div>

      <dl className="job-metadata">
        <div>
          <dt>
            <MapPin size={14} aria-hidden="true" />
            Location
          </dt>
          <dd>{shortLocation(job.locationText)}</dd>
        </div>
        <div>
          <dt>
            <CalendarDays size={14} aria-hidden="true" />
            Listed
          </dt>
          <dd>{relativeDate(job.publishedAt ?? job.firstSeenAt)}</dd>
        </div>
        <div>
          <dt>
            <Banknote size={14} aria-hidden="true" />
            Salary
          </dt>
          <dd>{job.salary ? `${job.salary} / year` : "Not specified"}</dd>
        </div>
      </dl>

      <ul className="job-tags" aria-label="Role attributes">
        {job.department ? <li>{job.department}</li> : null}
        {job.employmentType ? <li>{job.employmentType}</li> : null}
        {job.workplaceType ? <li>{job.workplaceType}</li> : null}
      </ul>

      <div className="match-footer">
        <div className="score-ring">
          <span className="sr-only">Match score </span>
          {job.score}
        </div>
        <div>
          <strong>Why it matched</strong>
          <p>{job.reasons.slice(0, 2).join(" · ")}</p>
        </div>
      </div>

      <JobActions profileId={profileId} jobId={job.id} initialState={job.state} />
    </article>
  );
}

function shortLocation(value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return "Location not listed";
  }
  return normalized.length > 86 ? `${normalized.slice(0, 83)}...` : normalized;
}

function relativeDate(date: Date): string {
  const days = Math.max(Math.floor((Date.now() - date.getTime()) / 86_400_000), 0);
  if (days === 0) {
    return "Today";
  }
  if (days === 1) {
    return "Yesterday";
  }
  return `${days} days ago`;
}
