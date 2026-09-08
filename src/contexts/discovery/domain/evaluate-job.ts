import { compareAnnualSalary } from "./annual-salary";
import type {
  ExclusionReason,
  JobMatchingCriteria,
  MatchableJob,
  MatchingPolicy,
  MatchReason,
  MatchResult,
} from "./job-match";

export function evaluateJob(
  job: MatchableJob,
  profile: JobMatchingCriteria,
  policy: MatchingPolicy,
  now: Date,
): MatchResult {
  const stopWords = new Set(policy.stopWords);
  const genericTitleTerms = new Set(policy.genericTitleTerms.map((term) => normalize(term)));
  const title = normalize(job.title);
  const description = normalize(job.description);
  const exclusionReasons: ExclusionReason[] = [];

  if (!profile.includeUnverified && !job.verified) {
    exclusionReasons.push({ code: "unverified-lead" });
  }

  const excludedTitle = firstContained(title, profile.excludedTitleTerms);
  if (excludedTitle) {
    exclusionReasons.push({ code: "excluded-title", term: excludedTitle });
  }

  const excludedDescription = firstContained(
    normalize(`${job.title} ${description}`),
    profile.excludedDescriptionTerms,
  );
  if (excludedDescription) {
    exclusionReasons.push({ code: "excluded-description", term: excludedDescription });
  }

  const requiredJobTerm = firstContained(
    normalize(`${job.title} ${job.department} ${job.description}`),
    profile.requiredJobTerms,
  );
  if (profile.requiredJobTerms.length > 0 && !requiredJobTerm) {
    exclusionReasons.push({ code: "missing-required-job-term" });
  }

  const titleMatch = titleScore(title, profile.titleTerms, stopWords, genericTitleTerms, policy);
  if (titleMatch.score === 0) {
    exclusionReasons.push({ code: "title-mismatch" });
  }

  const locationText = normalize([job.locationText, ...job.locations].join(" "));
  const geographicLocations = job.geographicLocations ?? [];
  const excludedLocation =
    firstContained(locationText, profile.excludedLocationTerms) ||
    geographicLocations
      .filter((location) => !location.uncertain)
      .flatMap((location) =>
        location.terms.filter((term) =>
          profile.excludedLocationTerms.some((excluded) => normalize(term) === normalize(excluded)),
        ),
      )[0] ||
    "";
  if (excludedLocation) {
    exclusionReasons.push({ code: "excluded-location", term: excludedLocation });
  }
  const geographicMatch =
    geographicLocations.find(
      (location) =>
        !location.uncertain &&
        location.terms.some((term) =>
          profile.locationTerms.some((target) => normalize(term) === normalize(target)),
        ),
    ) ??
    geographicLocations.find((location) =>
      location.terms.some((term) =>
        profile.locationTerms.some((target) => normalize(term) === normalize(target)),
      ),
    );
  const locationTerm = geographicMatch
    ? (profile.locationTerms.find((target) =>
        geographicMatch.terms.some((term) => normalize(term) === normalize(target)),
      ) ?? "")
    : firstContained(locationText, profile.locationTerms);
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
    exclusionReasons.push({ code: "location-mismatch" });
  }

  if (job.publishedAt) {
    const ageMs = now.getTime() - job.publishedAt.getTime();
    if (ageMs > profile.maxAgeDays * 86_400_000) {
      exclusionReasons.push({ code: "stale-listing", maximumAgeDays: profile.maxAgeDays });
    }
  }

  const salaryRelation = compareAnnualSalary(job.publishedSalary, {
    currency: profile.salaryCurrency,
    min: profile.salaryMin,
    max: profile.salaryMax,
  });
  if (salaryRelation === "below" && job.publishedSalary) {
    exclusionReasons.push({ code: "salary-below", salary: job.publishedSalary });
  }
  if (salaryRelation === "above" && job.publishedSalary) {
    exclusionReasons.push({ code: "salary-above", salary: job.publishedSalary });
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
  const reasons: MatchReason[] = [{ code: "title-match", term: titleMatch.term }];
  if (requiredJobTerm) {
    reasons.push({ code: "job-context-match", term: requiredJobTerm });
  }
  if (
    job.publishedSalary &&
    salaryRelation === "overlaps" &&
    (profile.salaryMin !== null || profile.salaryMax !== null)
  ) {
    reasons.push({ code: "salary-overlap", salary: job.publishedSalary });
  }

  if (locationTerm) {
    score += policy.locationScore;
    if (geographicMatch?.uncertain) {
      reasons.splice(1, 0, { code: "location-uncertain", term: locationTerm });
    } else {
      reasons.push({ code: "location-match", term: locationTerm });
    }
  } else {
    score += policy.remoteScore;
    reasons.push({ code: "remote-allowed" });
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
    reasons.push({ code: "posted-age", days: ageDays });
  } else {
    score += policy.unknownDateScore;
    reasons.push({ code: "posting-date-unknown" });
  }

  if (score < profile.minScore) {
    return {
      status: "excluded",
      score,
      reasons,
      exclusionReasons: [{ code: "score-below", minimumScore: profile.minScore }],
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
  return (job: MatchableJob, profile: JobMatchingCriteria, now: Date) =>
    evaluateJob(job, profile, policy, now);
}

function titleScore(
  title: string,
  rawTerms: readonly string[],
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

function firstContained(haystack: string, terms: readonly string[]): string {
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

function isUnrestrictedRemoteLocation(
  locationText: string,
  remoteTerms: readonly string[],
): boolean {
  if (!locationText) {
    return true;
  }

  const remoteTokens = new Set(remoteTerms.flatMap((term) => [...tokens(term, new Set())]));
  return normalize(locationText)
    .split(" ")
    .filter(Boolean)
    .every((token) => remoteTokens.has(token) || /^\d+$/.test(token));
}
