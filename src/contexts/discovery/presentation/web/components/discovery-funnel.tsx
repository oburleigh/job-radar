import { buttonAttributes, Panel } from "@job-radar/design-ui";
import { Link } from "react-router";

export interface DiscoveryFunnelCounts {
  readonly providerHits: number;
  readonly classifiedCandidates: number;
  readonly verifiedJobs: number;
  readonly verificationOnlyCandidates: number;
  readonly staleOnlyCandidates: number;
  readonly otherExclusions: number;
  readonly finalMatches: number;
}

interface ZeroMatchOutcome {
  readonly heading: string;
  readonly detail: string;
  readonly action: { readonly href: string; readonly label: string };
}

export function DiscoveryFunnel({
  counts,
  profileId,
}: {
  readonly counts: DiscoveryFunnelCounts;
  readonly profileId: number;
}) {
  const outcome = counts.finalMatches === 0 ? describeZeroMatchOutcome(counts, profileId) : null;
  const steps = [
    ["Provider hits", counts.providerHits],
    ["Classified", counts.classifiedCandidates],
    ["Verified", counts.verifiedJobs],
    ["Verification only", counts.verificationOnlyCandidates],
    ["Stale only", counts.staleOnlyCandidates],
    ["Other exclusions", counts.otherExclusions],
    ["Final matches", counts.finalMatches],
  ] as const;

  return (
    <Panel as="section" className="run-panel" aria-labelledby="discovery-funnel-heading">
      <div className="section-heading">
        <div>
          <h2 id="discovery-funnel-heading">Discovery funnel</h2>
        </div>
        <span>From provider response to profile match</span>
      </div>
      <dl className="discovery-funnel" aria-label="Completed run funnel">
        {steps.map(([label, count]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{count}</dd>
          </div>
        ))}
      </dl>
      {outcome ? (
        <div className="zero-match-explanation" role="note">
          <div>
            <strong>{outcome.heading}</strong>
            <p>{outcome.detail}</p>
          </div>
          <Link {...buttonAttributes()} to={outcome.action.href}>
            {outcome.action.label}
          </Link>
        </div>
      ) : null}
    </Panel>
  );
}

export function describeZeroMatchOutcome(
  counts: DiscoveryFunnelCounts,
  profileId: number,
): ZeroMatchOutcome {
  if (counts.providerHits === 0) {
    return {
      heading: "The provider returned no results",
      detail: "No candidates entered this run, so there was nothing to classify or match.",
      action: { href: "#query-details", label: "Review query details" },
    };
  }
  if (counts.classifiedCandidates === 0) {
    return {
      heading: "Returned results did not match a supported source",
      detail: `The provider returned ${counts.providerHits} results, but none could enter structured verification.`,
      action: {
        href: "/settings/adapters/source-coverage",
        label: "Review source coverage",
      },
    };
  }
  const dominant = Math.max(
    counts.verificationOnlyCandidates,
    counts.staleOnlyCandidates,
    counts.otherExclusions,
  );
  if (counts.verificationOnlyCandidates === dominant && dominant > 0) {
    return {
      heading: "Verification was the main reason no jobs matched",
      detail: `${dominant} ${candidateWord(dominant)} met no other rejection rule but lacked a structured listing.`,
      action: {
        href: `/profiles?profile=${profileId}`,
        label: "Review verification policy",
      },
    };
  }
  if (counts.staleOnlyCandidates === dominant && dominant > 0) {
    return {
      heading: "Listing age was the main reason no jobs matched",
      detail: `${dominant} verified ${candidateWord(dominant)} met no other rejection rule but ${dominant === 1 ? "was" : "were"} too old for this profile.`,
      action: {
        href: `/profiles?profile=${profileId}`,
        label: "Review maximum listing age",
      },
    };
  }
  if (counts.otherExclusions === dominant && dominant > 0) {
    return {
      heading: "Profile rules were the main reason no jobs matched",
      detail: `${dominant} ${candidateWord(dominant)} ${dominant === 1 ? "was" : "were"} excluded by title, location, salary, score, or another profile rule.`,
      action: { href: `/profiles?profile=${profileId}`, label: "Review profile rules" },
    };
  }
  return {
    heading: "Classified results did not reach a final match",
    detail: "Open a known role check to trace where a returned candidate stopped.",
    action: { href: "#known-role-check", label: "Explain a returned role" },
  };
}

function candidateWord(count: number): string {
  return count === 1 ? "candidate" : "candidates";
}
