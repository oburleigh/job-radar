import type { ExclusionReason, MatchReason } from "@/contexts/discovery/domain/job-match";

export interface DiagnosticQuery {
  readonly id: number;
  readonly atsType: string;
  readonly sourcePattern: string;
  readonly titleTerm: string;
  readonly status: "planned" | "running" | "completed" | "failed" | "cancelled";
  readonly providerResults: number;
}

export interface StoredJobDiagnostic {
  readonly id: number;
  readonly title: string;
  readonly companyName: string;
  readonly canonicalUrl: string;
  readonly active: boolean;
  readonly evidence: "search-lead" | "structured";
}

export type DiagnoseKnownRoleResult =
  | { readonly status: "run-not-found" }
  | {
      readonly status: "diagnosed";
      readonly requestedUrl: string;
      readonly canonicalUrl: string;
      readonly profileId: number;
      readonly source:
        | { readonly code: "supported-source"; readonly atsType: string }
        | { readonly code: "unsupported-source" };
      readonly queryPlan:
        | { readonly code: "query-planned"; readonly queries: readonly DiagnosticQuery[] }
        | { readonly code: "no-query-planned"; readonly queries: readonly [] };
      readonly providerResponse:
        | {
            readonly code: "provider-returned";
            readonly rank: number;
            readonly queryId: number | null;
          }
        | { readonly code: "provider-not-returned" };
      readonly classification:
        | { readonly code: "classified"; readonly atsType: string }
        | { readonly code: "unclassified" }
        | { readonly code: "not-reached" };
      readonly verification:
        | { readonly code: "verified"; readonly storedJob: StoredJobDiagnostic }
        | { readonly code: "unverified"; readonly storedJob: StoredJobDiagnostic }
        | { readonly code: "inactive"; readonly storedJob: StoredJobDiagnostic }
        | { readonly code: "not-observed"; readonly storedJob: null };
      readonly matching:
        | {
            readonly code: "matched" | "excluded";
            readonly score: number;
            readonly reasons: readonly MatchReason[];
            readonly exclusionReasons: readonly ExclusionReason[];
          }
        | {
            readonly code: "not-evaluated";
            readonly score: null;
            readonly reasons: readonly [];
            readonly exclusionReasons: readonly [];
          };
    };
