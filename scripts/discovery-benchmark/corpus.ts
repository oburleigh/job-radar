import type { JobListingEvidence } from "@/contexts/discovery/domain/job-listing-provenance";
import type {
  JobMatchingCriteria,
  MatchableJob,
  MatchingPolicy,
} from "@/contexts/discovery/domain/job-match";
import type { AtsType } from "@/contexts/discovery/infrastructure/job-sources/ats-integration";

import type {
  DiscoveryBenchmarkMarket,
  DiscoveryBenchmarkMatch,
  DiscoveryBenchmarkProfileDefinition,
  DiscoveryBenchmarkTrack,
  DiscoveryBenchmarkVerification,
} from "./discovery-benchmark";

export interface DiscoveryBenchmarkProfile extends DiscoveryBenchmarkProfileDefinition {
  readonly source: AtsType;
  readonly sourcePattern: string;
  readonly criteria: JobMatchingCriteria;
}

export interface DiscoveryBenchmarkExample {
  readonly id: string;
  readonly profile: string;
  readonly source: AtsType;
  readonly url: string;
  readonly providerReturned: boolean;
  readonly evidence: JobListingEvidence;
  readonly active: boolean;
  readonly job: Omit<MatchableJob, "verified">;
  readonly expectedVerification: DiscoveryBenchmarkVerification;
  readonly expectedMatch: DiscoveryBenchmarkMatch;
  readonly expectedVisible: boolean;
}

export interface DiscoveryBenchmarkCorpus {
  readonly benchmarkedAt: Date;
  readonly legacyAsiaRequestBaseline: {
    readonly titleTerms: number;
    readonly sources: number;
    readonly variantsPerTitleSource: number;
    readonly boardDiscoveryRequests: number;
    readonly totalRequests: number;
  };
  readonly policy: MatchingPolicy;
  readonly profiles: readonly DiscoveryBenchmarkProfile[];
  readonly examples: readonly DiscoveryBenchmarkExample[];
}

const benchmarkedAt = new Date("2026-08-25T12:00:00.000Z");

const profiles: readonly DiscoveryBenchmarkProfile[] = [
  profile("UK engineering leadership", "UK", "leadership", "greenhouse", "boards.greenhouse.io", {
    titleTerms: ["Head of Engineering"],
    locationTerms: ["United Kingdom"],
    requiredJobTerms: ["engineering"],
  }),
  profile(
    "UAE engineering leadership",
    "UAE",
    "leadership",
    "workday",
    "atlas.wd5.myworkdayjobs.com",
    {
      titleTerms: ["VP Engineering"],
      locationTerms: ["United Arab Emirates"],
      requiredJobTerms: ["engineering"],
    },
  ),
  profile(
    "Asia engineering leadership",
    "Asia",
    "leadership",
    "smartrecruiters",
    "jobs.smartrecruiters.com",
    {
      titleTerms: ["Engineering Director"],
      locationTerms: ["Singapore"],
      requiredJobTerms: ["engineering"],
    },
  ),
  profile(
    "UK platform/infrastructure IC",
    "UK",
    "individual-contributor",
    "ashby",
    "jobs.ashbyhq.com",
    {
      titleTerms: ["Staff Platform Engineer"],
      locationTerms: ["United Kingdom"],
      excludedDescriptionTerms: ["construction"],
    },
  ),
  profile(
    "UAE platform/infrastructure IC",
    "UAE",
    "individual-contributor",
    "lever",
    "jobs.lever.co",
    {
      titleTerms: ["Principal Infrastructure Engineer"],
      locationTerms: ["United Arab Emirates"],
      excludedTitleTerms: ["graduate"],
    },
  ),
];

const examples: readonly DiscoveryBenchmarkExample[] = [
  example({
    id: "uk-leadership-head-of-engineering",
    profile: "UK engineering leadership",
    source: "greenhouse",
    url: "https://boards.greenhouse.io/northstar/jobs/1001",
    title: "Head of Engineering",
    location: "London, United Kingdom",
    description: "Lead the engineering organisation.",
    expectedMatch: "matched",
    expectedVisible: true,
  }),
  example({
    id: "uk-leadership-sales-negative",
    profile: "UK engineering leadership",
    source: "greenhouse",
    url: "https://boards.greenhouse.io/northstar/jobs/1002",
    title: "Head of Sales",
    location: "London, United Kingdom",
    description: "Lead the commercial organisation.",
    expectedMatch: "excluded",
    expectedVisible: false,
  }),
  example({
    id: "uae-leadership-vp-engineering",
    profile: "UAE engineering leadership",
    source: "workday",
    url: "https://atlas.wd5.myworkdayjobs.com/en-US/External/job/Dubai/VP-Engineering_R-2001",
    title: "VP Engineering",
    location: "Dubai, United Arab Emirates",
    description: "Lead engineering across the group.",
    expectedMatch: "matched",
    expectedVisible: true,
  }),
  example({
    id: "uae-leadership-sales-negative",
    profile: "UAE engineering leadership",
    source: "workday",
    url: "https://atlas.wd5.myworkdayjobs.com/en-US/External/job/Dubai/VP-Sales_R-2002",
    title: "VP Sales",
    location: "Dubai, United Arab Emirates",
    description: "Lead enterprise sales.",
    expectedMatch: "excluded",
    expectedVisible: false,
  }),
  example({
    id: "asia-leadership-engineering-director",
    profile: "Asia engineering leadership",
    source: "smartrecruiters",
    url: "https://jobs.smartrecruiters.com/Orbit/744000136437109-engineering-director",
    title: "Engineering Director",
    location: "Singapore",
    description: "Lead engineering teams across Asia.",
    expectedMatch: "matched",
    expectedVisible: true,
  }),
  example({
    id: "asia-leadership-marketing-negative",
    profile: "Asia engineering leadership",
    source: "smartrecruiters",
    url: "https://jobs.smartrecruiters.com/Orbit/744000136437110-marketing-director",
    title: "Marketing Director",
    location: "Singapore",
    description: "Lead regional marketing.",
    expectedMatch: "excluded",
    expectedVisible: false,
  }),
  example({
    id: "asia-leadership-inactive-negative",
    profile: "Asia engineering leadership",
    source: "smartrecruiters",
    url: "https://jobs.smartrecruiters.com/Orbit/744000136437111-inactive-engineering-director",
    title: "Engineering Director",
    location: "Singapore",
    description: "Lead an engineering group.",
    active: false,
    expectedVerification: "inactive",
    expectedMatch: "not-evaluated",
    expectedVisible: false,
  }),
  example({
    id: "uk-ic-staff-platform-engineer",
    profile: "UK platform/infrastructure IC",
    source: "ashby",
    url: "https://jobs.ashbyhq.com/harbor/aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0001",
    title: "Staff Platform Engineer",
    location: "London, UK",
    description: "Build the internal software platform.",
    expectedMatch: "matched",
    expectedVisible: true,
  }),
  example({
    id: "uk-ic-construction-negative",
    profile: "UK platform/infrastructure IC",
    source: "ashby",
    url: "https://jobs.ashbyhq.com/harbor/aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0002",
    title: "Staff Platform Engineer",
    location: "London, UK",
    description: "Design construction platforms for civil works.",
    expectedMatch: "excluded",
    expectedVisible: false,
  }),
  example({
    id: "uk-ic-unverified-negative",
    profile: "UK platform/infrastructure IC",
    source: "ashby",
    url: "https://jobs.ashbyhq.com/harbor/aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0005",
    title: "Staff Platform Engineer",
    location: "London, UK",
    description: "Build the internal software platform.",
    evidence: "search-lead",
    expectedVerification: "unverified",
    expectedMatch: "excluded",
    expectedVisible: false,
  }),
  example({
    id: "uae-ic-principal-infrastructure-engineer",
    profile: "UAE platform/infrastructure IC",
    source: "lever",
    url: "https://jobs.lever.co/meridian/aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0003",
    title: "Principal Infrastructure Engineer",
    location: "Abu Dhabi, UAE",
    description: "Build reliable cloud infrastructure.",
    expectedMatch: "matched",
    expectedVisible: true,
  }),
  example({
    id: "uae-ic-graduate-negative",
    profile: "UAE platform/infrastructure IC",
    source: "lever",
    url: "https://jobs.lever.co/meridian/aaaaaaaa-bbbb-cccc-dddd-eeeeeeee0004",
    title: "Graduate Infrastructure Engineer",
    location: "Abu Dhabi, UAE",
    description: "Join the infrastructure team.",
    expectedMatch: "excluded",
    expectedVisible: false,
  }),
];

export const discoveryBenchmarkCorpus: DiscoveryBenchmarkCorpus = {
  benchmarkedAt,
  legacyAsiaRequestBaseline: {
    titleTerms: 12,
    sources: 15,
    variantsPerTitleSource: 2,
    boardDiscoveryRequests: 10,
    totalRequests: 370,
  },
  policy: {
    exactTitleScore: 60,
    fullTokenScore: 50,
    partialTokenScore: 42,
    partialTokenThreshold: 0.8,
    locationScore: 30,
    remoteScore: 25,
    unknownDateScore: 5,
    freshnessMaxScore: 10,
    freshnessMinimumScore: 2,
    freshnessStepDays: 3,
    stopWords: ["a", "an", "and", "of", "the", "to"],
    genericTitleTerms: ["head", "vp", "director", "staff", "principal"],
    remoteTerms: ["remote"],
    unrestrictedRemotePhrases: ["work from anywhere"],
  },
  profiles,
  examples,
};

function profile(
  name: string,
  market: DiscoveryBenchmarkMarket,
  track: DiscoveryBenchmarkTrack,
  source: AtsType,
  sourcePattern: string,
  overrides: Partial<JobMatchingCriteria>,
): DiscoveryBenchmarkProfile {
  return {
    name,
    market,
    track,
    source,
    sourcePattern,
    criteria: {
      titleTerms: [],
      locationTerms: [],
      requiredJobTerms: [],
      excludedTitleTerms: [],
      excludedLocationTerms: [],
      excludedDescriptionTerms: [],
      includeRemote: false,
      includeUnverified: false,
      salaryCurrency: null,
      salaryMin: null,
      salaryMax: null,
      maxAgeDays: 365,
      minScore: 70,
      ...overrides,
    },
  };
}

function example(input: {
  readonly id: string;
  readonly profile: string;
  readonly source: AtsType;
  readonly url: string;
  readonly title: string;
  readonly location: string;
  readonly description: string;
  readonly evidence?: JobListingEvidence;
  readonly active?: boolean;
  readonly expectedVerification?: DiscoveryBenchmarkVerification;
  readonly expectedMatch: DiscoveryBenchmarkMatch;
  readonly expectedVisible: boolean;
}): DiscoveryBenchmarkExample {
  return {
    id: input.id,
    profile: input.profile,
    source: input.source,
    url: input.url,
    providerReturned: true,
    evidence: input.evidence ?? "structured",
    active: input.active ?? true,
    job: {
      title: input.title,
      locationText: input.location,
      locations: [input.location],
      description: input.description,
      department: "Engineering",
      workplaceType: "On-site",
      publishedAt: benchmarkedAt,
      publishedSalary: null,
    },
    expectedVerification: input.expectedVerification ?? "verified",
    expectedMatch: input.expectedMatch,
    expectedVisible: input.expectedVisible,
  };
}
