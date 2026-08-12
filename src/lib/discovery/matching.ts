import type { MatchableJob, MatchProfile, MatchResult } from "./types";

import { getJobRadarConfig } from "@/config/job-radar";
import { extractAnnualSalary, formatAnnualSalary } from "./salary";

const UNRESTRICTED_REMOTE_PHRASES = [
  "work from anywhere",
  "anywhere in the world",
  "work remotely from anywhere",
  "globally remote",
  "global remote",
  "worldwide remote",
  "remote worldwide",
  "location agnostic",
];

export function evaluateJob(
  job: MatchableJob,
  profile: MatchProfile,
  now = new Date(),
): MatchResult {
  const scoring = getJobRadarConfig().matching;
  const stopWords = new Set(scoring.stopWords);
  const genericTitleTerms = new Set(scoring.genericTitleTerms.map((term) => normalize(term)));
  const title = normalize(job.title);
  const description = normalize(job.description);
  const exclusionReasons: string[] = [];

  if (!profile.includeUnverified && !job.verified) {
    exclusionReasons.push("Web-search lead is not verified by an ATS feed");
  }

  const excludedTitle = firstContained(title, profile.excludedTitleTerms);
  if (excludedTitle) {
    exclusionReasons.push(`Excluded title term: ${excludedTitle}`);
  }

  const excludedDescription = firstContained(
    normalize(`${job.title} ${description}`),
    profile.excludedDescriptionTerms,
  );
  if (excludedDescription) {
    exclusionReasons.push(`Excluded description term: ${excludedDescription}`);
  }

  const requiredJobTerm = firstContained(
    normalize(`${job.title} ${job.department} ${job.description}`),
    profile.requiredJobTerms,
  );
  if (profile.requiredJobTerms.length > 0 && !requiredJobTerm) {
    exclusionReasons.push("Missing a required job keyword");
  }

  const titleMatch = titleScore(title, profile.titleTerms, stopWords, genericTitleTerms);
  if (titleMatch.score === 0) {
    exclusionReasons.push("Title does not match a target role");
  }

  const locationText = normalize([job.locationText, ...job.locations].join(" "));
  const excludedLocation = firstContained(locationText, profile.excludedLocationTerms);
  if (excludedLocation) {
    exclusionReasons.push(`Excluded location term: ${excludedLocation}`);
  }
  const locationTerm = firstContained(locationText, profile.locationTerms);
  const remoteText = normalize(`${job.locationText} ${job.workplaceType}`);
  const isRemote = scoring.remoteTerms.some((term) => remoteText.includes(normalize(term)));
  const unrestrictedRemoteText = normalize(`${job.title} ${job.description} ${job.workplaceType}`);
  const explicitlyUnrestrictedRemote = UNRESTRICTED_REMOTE_PHRASES.some((phrase) =>
    contains(unrestrictedRemoteText, normalize(phrase)),
  );
  const isLocationAgnosticRemote =
    isRemote &&
    (explicitlyUnrestrictedRemote ||
      isUnrestrictedRemoteLocation(locationText, scoring.remoteTerms));

  if (!locationTerm && !(profile.includeRemote && isLocationAgnosticRemote)) {
    exclusionReasons.push("Location does not match the profile");
  }

  if (job.publishedAt) {
    const ageMs = now.getTime() - job.publishedAt.getTime();
    if (ageMs > profile.maxAgeDays * 86_400_000) {
      exclusionReasons.push(`Posted more than ${profile.maxAgeDays} days ago`);
    }
  }

  const publishedSalary = extractAnnualSalary(job.description, job.rawPayload ?? {});
  const salaryExclusion = salaryExclusionReason(publishedSalary, profile);
  if (salaryExclusion) {
    exclusionReasons.push(salaryExclusion);
  }

  if (exclusionReasons.length > 0) {
    return {
      status: "excluded",
      score: 0,
      reasons: [],
      exclusionReasons,
    };
  }

  let score = titleMatch.score;
  const reasons = [`Title matches ${titleMatch.term}`];
  if (requiredJobTerm) {
    reasons.push(`Job context matches ${requiredJobTerm}`);
  }
  if (
    publishedSalary &&
    publishedSalary.currency === profile.salaryCurrency &&
    (profile.salaryMin !== null || profile.salaryMax !== null)
  ) {
    reasons.push(`Salary ${formatAnnualSalary(publishedSalary)} overlaps the profile preference`);
  }

  if (locationTerm) {
    score += scoring.locationScore;
    reasons.push(`Location matches ${locationTerm}`);
  } else {
    score += scoring.remoteScore;
    reasons.push("Remote role allowed by profile");
  }

  if (job.publishedAt) {
    const ageDays = Math.max(
      Math.floor((now.getTime() - job.publishedAt.getTime()) / 86_400_000),
      0,
    );
    score += Math.max(
      scoring.freshnessMaxScore - Math.floor(ageDays / scoring.freshnessStepDays),
      scoring.freshnessMinimumScore,
    );
    reasons.push(`Posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago`);
  } else {
    score += scoring.unknownDateScore;
    reasons.push("Posting date unavailable");
  }

  if (score < profile.minScore) {
    return {
      status: "excluded",
      score,
      reasons,
      exclusionReasons: [`Score is below ${profile.minScore}`],
    };
  }

  return {
    status: "matched",
    score: Math.min(score, 100),
    reasons,
    exclusionReasons: [],
  };
}

function salaryExclusionReason(
  salary: ReturnType<typeof extractAnnualSalary>,
  profile: MatchProfile,
): string {
  if (!salary || !profile.salaryCurrency || salary.currency !== profile.salaryCurrency) {
    return "";
  }
  if (profile.salaryMin !== null && salary.max !== null && salary.max < profile.salaryMin) {
    return `Salary ${formatAnnualSalary(salary)} is below the preferred range`;
  }
  if (profile.salaryMax !== null && salary.min !== null && salary.min > profile.salaryMax) {
    return `Salary ${formatAnnualSalary(salary)} is above the preferred range`;
  }
  return "";
}

function titleScore(
  title: string,
  rawTerms: string[],
  stopWords: Set<string>,
  genericTitleTerms: Set<string>,
): { score: number; term: string } {
  const scoring = getJobRadarConfig().matching;
  let best = { score: 0, term: "" };
  const orderedTitleTokens = tokenList(title, stopWords);
  const titleTokens = new Set(orderedTitleTokens);

  for (const rawTerm of rawTerms) {
    const term = normalize(rawTerm);
    let score = 0;
    if (contains(title, term)) {
      score = scoring.exactTitleScore;
    } else {
      const orderedTermTokens = tokenList(term, stopWords);
      const termTokens = new Set(orderedTermTokens);
      if (orderedTermTokens.length > 0) {
        const significantTokens = orderedTermTokens.filter(
          (token) => !genericTitleTerms.has(token),
        );
        const hasSignificantOverlap =
          significantTokens.length === 0 ||
          significantTokens.some((token) => titleTokens.has(token));
        const overlap =
          orderedTermTokens.filter((token) => titleTokens.has(token)).length / termTokens.size;
        const orderedOverlap =
          orderedOverlapCount(orderedTitleTokens, orderedTermTokens) / orderedTermTokens.length;
        score =
          overlap === 1 && orderedOverlap === 1
            ? scoring.fullTokenScore
            : hasSignificantOverlap &&
                overlap >= scoring.partialTokenThreshold &&
                orderedOverlap >= scoring.partialTokenThreshold
              ? scoring.partialTokenScore
              : 0;
      }
    }
    if (score > best.score) {
      best = { score, term: rawTerm };
    }
  }

  return best;
}

function firstContained(haystack: string, terms: string[]): string {
  return terms.find((term) => contains(haystack, normalize(term))) ?? "";
}

function contains(haystack: string, needle: string): boolean {
  if (!needle) {
    return false;
  }
  return ` ${haystack} `.includes(` ${needle} `);
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokens(value: string, stopWords: Set<string>): Set<string> {
  return new Set(tokenList(value, stopWords));
}

function tokenList(value: string, stopWords: Set<string>): string[] {
  return normalize(value)
    .split(" ")
    .filter((token) => token && !stopWords.has(token));
}

function orderedOverlapCount(titleTokens: string[], termTokens: string[]): number {
  let titleIndex = 0;
  let matches = 0;
  for (const termToken of termTokens) {
    while (titleIndex < titleTokens.length && titleTokens[titleIndex] !== termToken) {
      titleIndex += 1;
    }
    if (titleIndex >= titleTokens.length) {
      break;
    }
    matches += 1;
    titleIndex += 1;
  }
  return matches;
}

function isUnrestrictedRemoteLocation(locationText: string, remoteTerms: string[]): boolean {
  if (!locationText) {
    return true;
  }

  const remoteTokens = new Set(remoteTerms.flatMap((term) => [...tokens(term, new Set())]));
  return normalize(locationText)
    .split(" ")
    .filter(Boolean)
    .every((token) => remoteTokens.has(token) || /^\d+$/.test(token));
}
