import { extractAnnualSalary, formatAnnualSalary } from "./annual-salary";
import type { MatchableJob, MatchingPolicy, MatchProfile, MatchResult } from "./job-match";

export function evaluateJob(
  job: MatchableJob,
  profile: MatchProfile,
  policy: MatchingPolicy,
  now = new Date(),
): MatchResult {
  const stopWords = new Set(policy.stopWords);
  const genericTitleTerms = new Set(policy.genericTitleTerms.map((term) => normalize(term)));
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

  const titleMatch = titleScore(title, profile.titleTerms, stopWords, genericTitleTerms, policy);
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
  const isRemote = policy.remoteTerms.some((term) => remoteText.includes(normalize(term)));
  const unrestrictedRemoteText = normalize(`${job.title} ${job.description} ${job.workplaceType}`);
  const explicitlyUnrestrictedRemote = policy.unrestrictedRemotePhrases.some((phrase) =>
    contains(unrestrictedRemoteText, normalize(phrase)),
  );
  const isLocationAgnosticRemote =
    isRemote &&
    (explicitlyUnrestrictedRemote ||
      isUnrestrictedRemoteLocation(locationText, policy.remoteTerms));

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
    score += policy.locationScore;
    reasons.push(`Location matches ${locationTerm}`);
  } else {
    score += policy.remoteScore;
    reasons.push("Remote role allowed by profile");
  }

  if (job.publishedAt) {
    const ageDays = Math.max(
      Math.floor((now.getTime() - job.publishedAt.getTime()) / 86_400_000),
      0,
    );
    score += Math.max(
      policy.freshnessMaxScore - Math.floor(ageDays / policy.freshnessStepDays),
      policy.freshnessMinimumScore,
    );
    reasons.push(`Posted ${ageDays} day${ageDays === 1 ? "" : "s"} ago`);
  } else {
    score += policy.unknownDateScore;
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

/**
 * Binds a product policy once for batch evaluation while preserving a compact
 * function-shaped interface for callers that only own a profile and a job.
 */
export function createJobMatcher(policy: MatchingPolicy) {
  return (job: MatchableJob, profile: MatchProfile, now = new Date()) =>
    evaluateJob(job, profile, policy, now);
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
  policy: MatchingPolicy,
): { score: number; term: string } {
  let best = { score: 0, term: "" };
  const orderedTitleTokens = tokenList(title, stopWords);
  const titleTokens = new Set(orderedTitleTokens);

  for (const rawTerm of rawTerms) {
    const term = normalize(rawTerm);
    let score = 0;
    if (contains(title, term)) {
      score = policy.exactTitleScore;
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
            ? policy.fullTokenScore
            : hasSignificantOverlap &&
                overlap >= policy.partialTokenThreshold &&
                orderedOverlap >= policy.partialTokenThreshold
              ? policy.partialTokenScore
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
