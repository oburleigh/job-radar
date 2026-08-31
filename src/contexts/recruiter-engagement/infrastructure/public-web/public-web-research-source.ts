import { iso31661 } from "iso-3166";
import type { ResearchSource } from "@/contexts/recruiter-engagement/application/research-runs/port";
import type {
  Evidence,
  FirmObservation,
  RecruiterObservation,
} from "@/contexts/recruiter-engagement/domain/observation";
import type {
  PublicResearchQueryPolicy,
  ResearchRun,
} from "@/contexts/recruiter-engagement/domain/research-run";
import type { WebSearchClient, WebSearchResult } from "@/platform/search/web-search-client";

type PublicWebResearchSourceOptions = {
  readonly client: WebSearchClient;
  readonly failures?: {
    readonly record: (failure: {
      readonly adapterId: string;
      readonly message: string;
      readonly recordedAt: Date;
      readonly runId: string;
      readonly stage: "firms" | "recruiters";
    }) => Promise<void>;
  };
  readonly now: () => Date;
  readonly providerName: string;
};

export function createPublicWebResearchSource({
  client,
  failures,
  now,
  providerName,
}: PublicWebResearchSourceOptions): ResearchSource {
  const adapterId = `public-web-search:${providerName}:v1`;
  return {
    adapterId,
    assess(run) {
      if (!run.policy.enabled) return { available: false, message: run.policy.disabledBehavior };
      if (!run.sourcePlan.publicSearch) {
        return { available: false, message: "The frozen Source plan has no public search policy." };
      }
      const entries = run.sourcePlan.entries.filter((entry) => entry.adapterId === adapterId);
      if (run.policy.id !== adapterId || entries.length !== 2) {
        return {
          available: false,
          message: "The frozen Adapter policy does not permit this public web Source.",
        };
      }
      return { available: true };
    },
    async findFirms({ reserveRequest, run, signal }) {
      requireAvailable(run, adapterId);
      const policy = requireSearchPolicy(run);
      const firms = new Map<string, FirmObservation>();
      let attempted = 0;
      let succeeded = 0;
      for (const query of firmQueries(run, policy)) {
        for (let page = 1; page <= policy.maxPagesPerQuery; page += 1) {
          if (!(await reserveRequest())) return [...firms.values()];
          attempted += 1;
          try {
            const resultPage = await client.search({
              count: policy.resultsPerQuery,
              page,
              query,
              signal,
            });
            succeeded += 1;
            for (const result of resultPage.results) {
              const observation = firmObservation(result, run, policy, adapterId, now());
              if (observation && !firms.has(observation.websiteUrl)) {
                firms.set(observation.websiteUrl, observation);
              }
            }
            if (!resultPage.hasMore) break;
          } catch (error) {
            await recordFailure(failures, adapterId, run.id, "firms", error, now());
            break;
          }
        }
      }
      if (attempted > 0 && succeeded === 0) {
        throw new Error("Every public firm search request failed.");
      }
      return [...firms.values()];
    },
    async findRecruiters({ firms, reserveRequest, run, signal }) {
      requireAvailable(run, adapterId);
      const policy = requireSearchPolicy(run);
      const recruiters = new Map<string, RecruiterObservation>();
      const completedFirmSearches = new Set<string>();
      let attempted = 0;
      let succeeded = 0;
      for (let page = 1; page <= policy.maxPagesPerQuery; page += 1) {
        for (const firm of firms) {
          if (completedFirmSearches.has(firm.websiteUrl)) continue;
          if (!(await reserveRequest())) return [...recruiters.values()];
          attempted += 1;
          try {
            const resultPage = await client.search({
              count: policy.resultsPerQuery,
              page,
              query: recruiterQuery(run, firm, policy),
              signal,
            });
            succeeded += 1;
            for (const result of resultPage.results) {
              const observation = recruiterObservation(result, firm, run, policy, adapterId, now());
              if (observation && !recruiters.has(observation.profileUrl)) {
                recruiters.set(observation.profileUrl, observation);
              }
            }
            if (!resultPage.hasMore) completedFirmSearches.add(firm.websiteUrl);
          } catch (error) {
            await recordFailure(failures, adapterId, run.id, "recruiters", error, now());
            completedFirmSearches.add(firm.websiteUrl);
          }
        }
      }
      if (attempted > 0 && succeeded === 0) {
        throw new Error("Every public recruiter search request failed.");
      }
      return [...recruiters.values()];
    },
  };
}

function firmObservation(
  result: WebSearchResult,
  run: ResearchRun,
  policy: PublicResearchQueryPolicy,
  adapterId: string,
  observedAt: Date,
): FirmObservation | null {
  const url = new URL(result.url);
  if (matchesHost(url, policy.excludedHosts) || matchesProfileSource(url, policy)) return null;
  const text = `${result.title} ${result.snippet}`;
  const specialisms = matchingValues(text, run.brief.criteria.specialisms);
  const industries = matchingValues(text, run.brief.criteria.industries);
  if (specialisms.length === 0 && industries.length === 0) return null;
  const targetMarkets = run.brief.criteria.targetLocations.filter((target) =>
    supportsTargetMarket(text, url, target),
  );
  const rankingSignals = {
    currentMandatesOrActivity: containsAny(text, policy.currentActivityTerms),
    namedRecruiterOrTeamEvidence: containsAny(text, policy.namedRecruiterOrTeamTerms),
    scaleOrTrackRecord: containsAny(text, policy.scaleOrTrackRecordTerms),
    targetMarkets,
  };
  return {
    companyName: companyName(result, url, run, policy),
    evidence: evidence(
      result,
      adapterId,
      observedAt,
      qualificationConfidence({
        hasSpecialism: specialisms.length > 0,
        hasTargetMarket: targetMarkets.length > 0,
        hasCurrentActivity: rankingSignals.currentMandatesOrActivity,
      }),
    ),
    industries,
    kind: "firm",
    rankingSignals,
    reason: result.snippet || result.title,
    specialisms,
    websiteUrl: url.origin,
  };
}

function recruiterObservation(
  result: WebSearchResult,
  firm: FirmObservation,
  run: ResearchRun,
  policy: PublicResearchQueryPolicy,
  adapterId: string,
  observedAt: Date,
): RecruiterObservation | null {
  const url = new URL(result.url);
  if (!matchesProfileSource(url, policy)) return null;
  const text = `${result.title} ${result.snippet}`;
  if (
    !includesNormalised(text, firm.companyName) ||
    !containsAny(text, policy.recruiterRoleTerms)
  ) {
    return null;
  }
  const [namePart, ...titleParts] = result.title.split(/\s+-\s+/);
  const name = namePart?.trim();
  if (!name) return null;
  const title = titleParts
    .join(" - ")
    .split(/\s+\|\s+/)[0]
    ?.trim();
  return {
    companyName: firm.companyName,
    evidence: evidence(result, adapterId, observedAt, "high"),
    kind: "recruiter",
    name,
    profileUrl: result.url,
    title: title || matchingValues(text, run.brief.criteria.specialisms)[0] || "Recruiter",
  };
}

function firmQueries(run: ResearchRun, policy: PublicResearchQueryPolicy): readonly string[] {
  const focuses = [...run.brief.criteria.specialisms, ...run.brief.criteria.industries].filter(
    (value, index, values) =>
      values.findIndex((candidate) => normalise(candidate) === normalise(value)) === index,
  );
  const targets = run.brief.criteria.targetLocations.map(locationQueryTerm).join(" OR ");
  return policy.firmDiscoveryPhrases.flatMap((phrase) =>
    focuses.map((focus) => `${focus} ${phrase} ${targets}`),
  );
}

function recruiterQuery(
  run: ResearchRun,
  firm: FirmObservation,
  policy: PublicResearchQueryPolicy,
): string {
  const profileSources = policy.profileSourceHosts.map((host) => `site:${host}`).join(" OR ");
  return [
    profileSources,
    firm.companyName,
    run.brief.criteria.specialisms.join(" "),
    policy.recruiterRoleTerms[0],
    run.brief.criteria.targetLocations.map(locationQueryTerm).join(" "),
  ]
    .filter(Boolean)
    .join(" ");
}

function companyName(
  result: WebSearchResult,
  url: URL,
  run: ResearchRun,
  policy: PublicResearchQueryPolicy,
): string {
  const parts = result.title
    .split(/\s+(?:\||-|–|—)\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  const domainLabel =
    url.hostname
      .toLocaleLowerCase()
      .replace(/^www\./, "")
      .split(".")[0] ?? "";
  const domainIdentity = normalise(domainLabel).replaceAll(" ", "");
  const domainPart = parts.find((part) => {
    const partIdentity = normalise(part).replaceAll(" ", "");
    return (
      partIdentity.length >= 4 &&
      (partIdentity === domainIdentity || domainIdentity.includes(partIdentity))
    );
  });
  if (domainPart) return domainPart;
  if (
    parts.length === 1 &&
    normalise(`${result.title} ${result.snippet}`).includes(domainIdentity)
  ) {
    return displayDomainName(domainLabel);
  }
  const policyWords = [
    ...policy.firmDiscoveryPhrases,
    ...run.brief.criteria.industries,
    ...run.brief.criteria.specialisms,
    ...run.brief.criteria.targetLocations,
  ]
    .flatMap((value) => normalise(value).split(" "))
    .filter((value) => value.length > 2);
  const selected =
    parts.toSorted((left, right) => {
      const score = (value: string) =>
        policyWords.filter((word) => normalise(value).includes(word)).length;
      return score(left) - score(right) || left.length - right.length;
    })[0] ?? result.title.trim();
  return isGeographicTitle(selected, run) || normalise(selected).length <= 5
    ? displayDomainName(domainLabel)
    : selected;
}

function isGeographicTitle(value: string, run: ResearchRun): boolean {
  const normalised = normalise(value);
  return run.brief.criteria.targetLocations.some((target) => {
    const targetWords = normalise(target).split(" ");
    return (
      targetWords.includes(normalised) ||
      locationQueryTerm(target).toLocaleLowerCase() === normalised
    );
  });
}

function displayDomainName(value: string): string {
  return value
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toLocaleUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function evidence(
  result: WebSearchResult,
  adapterId: string,
  observedAt: Date,
  confidence: Evidence["confidence"],
): Evidence {
  return {
    adapterId,
    confidence,
    excerpt: (result.snippet || result.title).slice(0, 280),
    observedAt: observedAt.toISOString().slice(0, 10),
    policyVersion: "1",
    sourceUrl: result.url,
  };
}

function matchingValues(text: string, values: readonly string[]): string[] {
  return values.filter((value) => includesNormalised(text, value));
}

function containsAny(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => includesNormalised(text, term));
}

function includesNormalised(text: string, term: string): boolean {
  return normalise(text).includes(normalise(term));
}

function includesTermOrInitials(text: string, term: string): boolean {
  if (includesNormalised(text, term)) return true;
  const initials = term
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .map((word) => word[0])
    .join("");
  return initials.length >= 2 && normalise(text).includes(initials.toLocaleLowerCase());
}

function supportsTargetMarket(text: string, url: URL, target: string): boolean {
  if (includesTermOrInitials(text, target)) return true;
  const normalisedTarget = normalise(target);
  const country = iso31661.find((entry) => normalisedTarget.includes(normalise(entry.name)));
  return country
    ? url.hostname.toLocaleLowerCase().endsWith(`.${country.alpha2.toLowerCase()}`)
    : false;
}

function locationQueryTerm(target: string): string {
  const normalisedTarget = normalise(target);
  const country = iso31661.find((entry) => normalisedTarget.includes(normalise(entry.name)));
  if (!country) return target;
  const countryInitials = country.name
    .split(/\s+/)
    .filter((word) => word.length > 2)
    .map((word) => word[0]?.toLocaleUpperCase() ?? "")
    .join("");
  const locality = target
    .replace(new RegExp(country.name, "i"), "")
    .replace(/^[,\s]+|[,\s]+$/g, "");
  return [locality, countryInitials].filter(Boolean).join(" ");
}

function normalise(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function matchesHost(url: URL, hosts: readonly string[]): boolean {
  const hostname = url.hostname.toLocaleLowerCase().replace(/^www\./, "");
  return hosts.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

function matchesProfileSource(url: URL, policy: PublicResearchQueryPolicy): boolean {
  const source = `${url.hostname.toLocaleLowerCase()}${url.pathname.toLocaleLowerCase()}`;
  return policy.profileSourceHosts.some((host) => source.includes(host.toLocaleLowerCase()));
}

function qualificationConfidence(input: {
  readonly hasCurrentActivity: boolean;
  readonly hasSpecialism: boolean;
  readonly hasTargetMarket: boolean;
}): Evidence["confidence"] {
  return input.hasCurrentActivity && input.hasSpecialism && input.hasTargetMarket
    ? "high"
    : "medium";
}

function requireSearchPolicy(run: ResearchRun): PublicResearchQueryPolicy {
  if (!run.sourcePlan.publicSearch)
    throw new Error("The frozen Source plan has no public search policy.");
  return run.sourcePlan.publicSearch;
}

function requireAvailable(run: ResearchRun, adapterId: string): void {
  if (
    !run.policy.enabled ||
    run.policy.id !== adapterId ||
    !run.sourcePlan.publicSearch ||
    !run.sourcePlan.entries.some((entry) => entry.adapterId === adapterId)
  ) {
    throw new Error("The frozen Adapter policy does not permit this public web Source.");
  }
}

async function recordFailure(
  failures: PublicWebResearchSourceOptions["failures"],
  adapterId: string,
  runId: string,
  stage: "firms" | "recruiters",
  error: unknown,
  recordedAt: Date,
): Promise<void> {
  await failures?.record({
    adapterId,
    message: error instanceof Error ? error.message : String(error),
    recordedAt,
    runId,
    stage,
  });
}
