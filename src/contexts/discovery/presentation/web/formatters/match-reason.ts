import type { ExclusionReason, MatchReason } from "@/contexts/discovery/domain/job-match";
import { formatAnnualSalary } from "./annual-salary";

export function formatMatchReason(reason: MatchReason): string {
  switch (reason.code) {
    case "title-match":
      return `Title matches ${reason.term}`;
    case "job-context-match":
      return `Job context matches ${reason.term}`;
    case "salary-overlap":
      return `Salary ${formatAnnualSalary(reason.salary)} overlaps the profile preference`;
    case "location-match":
      return `Location matches ${reason.term}`;
    case "remote-allowed":
      return "Remote role allowed by profile";
    case "posted-age":
      return `Posted ${reason.days} day${reason.days === 1 ? "" : "s"} ago`;
    case "posting-date-unknown":
      return "Posting date unavailable";
  }
}

export function formatExclusionReason(reason: ExclusionReason): string {
  switch (reason.code) {
    case "unverified-lead":
      return "Web-search lead is not verified by a structured listing";
    case "excluded-title":
      return `Excluded title term: ${reason.term}`;
    case "excluded-description":
      return `Excluded description term: ${reason.term}`;
    case "missing-required-job-term":
      return "Missing a required job keyword";
    case "title-mismatch":
      return "Title does not match a target role";
    case "excluded-location":
      return `Excluded location term: ${reason.term}`;
    case "location-mismatch":
      return "Location does not match the profile";
    case "stale-listing":
      return `Posted more than ${reason.maximumAgeDays} days ago`;
    case "salary-below":
      return `Salary ${formatAnnualSalary(reason.salary)} is below the preferred range`;
    case "salary-above":
      return `Salary ${formatAnnualSalary(reason.salary)} is above the preferred range`;
    case "score-below":
      return `Score is below ${reason.minimumScore}`;
  }
}
