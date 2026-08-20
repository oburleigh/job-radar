export const ATS_TYPES = [
  "ashby",
  "greenhouse",
  "lever",
  "bamboohr",
  "workable",
  "smartrecruiters",
  "workday",
  "icims",
  "jobvite",
  "linkedin",
] as const;

export type BuiltInAtsType = (typeof ATS_TYPES)[number];
export type AtsType = string;

export function isBuiltInAtsType(value: string): value is BuiltInAtsType {
  return (ATS_TYPES as readonly string[]).includes(value);
}

export type BoardConfig = Record<string, string>;

export interface BoardIdentity {
  atsType: AtsType;
  canonicalKey: string;
  slug: string;
  baseUrl: string;
  config: BoardConfig;
}

export interface ClassifiedUrl {
  atsType: AtsType;
  canonicalUrl: string;
  externalId: string;
  board: BoardIdentity | null;
}

export interface SearchHit {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchProvider {
  readonly name: string;
  search(query: string, options?: SearchOptions): Promise<SearchHit[]>;
}

export interface SearchOptions {
  count?: number;
  maxAgeDays?: number;
}

export interface BoardInput {
  id: number;
  atsType: AtsType;
  canonicalKey: string;
  companyName: string;
  slug: string;
  baseUrl: string;
  config: BoardConfig;
}

export interface RawJob {
  atsType: AtsType;
  externalId: string;
  canonicalUrl: string;
  applyUrl: string;
  title: string;
  companyName: string;
  locations: string[];
  description: string;
  department: string;
  employmentType: string;
  workplaceType: string;
  publishedAt: Date | null;
  rawPayload: Record<string, unknown>;
}

export type {
  MatchableJob,
  MatchingPolicy,
  MatchProfile,
  MatchResult,
} from "@/domain/discovery/types";
