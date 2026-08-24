import type { DiagnoseKnownRoleResult } from "@/contexts/discovery/application/discovery-runs/diagnose-known-role/result";
import { formatExclusionReason } from "@/contexts/discovery/presentation/web/formatters/match-reason";

type Diagnostic = Extract<DiagnoseKnownRoleResult, { status: "diagnosed" }>;

export function KnownRoleDiagnostic({ diagnostic }: { readonly diagnostic: Diagnostic }) {
  return (
    <section className="known-role-diagnostic" aria-label="Known role diagnostic">
      <div className="diagnostic-heading">
        <p className="eyebrow">Pipeline trace</p>
        <h3>Where this role stopped</h3>
        <code>{diagnostic.canonicalUrl}</code>
      </div>

      <ol className="diagnostic-stages">
        <DiagnosticStage label="Source coverage">
          {diagnostic.source.code === "supported-source" ? (
            <p>{formatAtsType(diagnostic.source.atsType)} is configured as a supported source.</p>
          ) : (
            <p>No source or ATS integration recognizes this hostname.</p>
          )}
        </DiagnosticStage>

        <DiagnosticStage label="Query plan">
          {diagnostic.queryPlan.code === "query-planned" ? (
            <>
              <p>
                {diagnostic.queryPlan.queries.length} matching source quer
                {diagnostic.queryPlan.queries.length === 1 ? "y was" : "ies were"} planned.
              </p>
              <ul>
                {diagnostic.queryPlan.queries.map((query) => (
                  <li key={query.id}>
                    <a href={`#query-${query.id}`}>
                      {query.titleTerm} · {query.sourcePattern}
                    </a>{" "}
                    <span>
                      ({query.status}, {query.providerResults} result
                      {query.providerResults === 1 ? "" : "s"})
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>No query for this source was planned in this run.</p>
          )}
        </DiagnosticStage>

        <DiagnosticStage label="Provider response">
          <p>
            {diagnostic.providerResponse.code === "provider-returned"
              ? `Provider returned this URL at rank ${diagnostic.providerResponse.rank}.`
              : diagnostic.queryPlan.code === "query-planned"
                ? "The provider did not return this URL. It never reached post-fetch filtering."
                : "The provider did not return this URL."}
          </p>
          {diagnostic.providerResponse.code === "provider-returned" &&
          diagnostic.providerResponse.queryId ? (
            <a href={`#query-${diagnostic.providerResponse.queryId}`}>View the returning query</a>
          ) : null}
        </DiagnosticStage>

        <DiagnosticStage label="URL classification">
          <p>{classificationMessage(diagnostic)}</p>
        </DiagnosticStage>

        <DiagnosticStage label="Verification">
          <p>{verificationMessage(diagnostic)}</p>
          {diagnostic.verification.storedJob ? (
            <a
              href={diagnostic.verification.storedJob.canonicalUrl}
              target="_blank"
              rel="noreferrer"
            >
              Open stored listing
            </a>
          ) : null}
        </DiagnosticStage>

        <DiagnosticStage label="Profile decision">
          <p>{matchingMessage(diagnostic)}</p>
          {diagnostic.matching.code === "excluded" ? (
            <ul>
              {diagnostic.matching.exclusionReasons.map((reason) => (
                <li key={JSON.stringify(reason)}>{formatExclusionReason(reason)}</li>
              ))}
            </ul>
          ) : null}
        </DiagnosticStage>
      </ol>
    </section>
  );
}

function DiagnosticStage({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <li>
      <strong>{label}</strong>
      <div>{children}</div>
    </li>
  );
}

function classificationMessage(diagnostic: Diagnostic): string {
  switch (diagnostic.classification.code) {
    case "classified":
      return `Classified as ${formatAtsType(diagnostic.classification.atsType)}.`;
    case "unclassified":
      return "The returned URL could not be classified into a supported ATS integration.";
    case "not-reached":
      return "Classification was not reached because the provider did not return the URL.";
  }
}

function verificationMessage(diagnostic: Diagnostic): string {
  switch (diagnostic.verification.code) {
    case "verified":
      return "Verified from structured ATS data.";
    case "unverified":
      return "Stored only as an unverified web-search lead.";
    case "inactive":
      return "The stored listing is inactive.";
    case "not-observed":
      return "No stored listing was produced for this URL.";
  }
}

function matchingMessage(diagnostic: Diagnostic): string {
  switch (diagnostic.matching.code) {
    case "matched":
      return `Matched this profile with score ${diagnostic.matching.score}.`;
    case "excluded":
      return "Excluded from this profile.";
    case "not-evaluated":
      return "No match decision was recorded because the role did not reach evaluation.";
  }
}

function formatAtsType(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
