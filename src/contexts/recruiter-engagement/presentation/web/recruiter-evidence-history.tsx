import type { DirectoryEvidence } from "@/contexts/recruiter-engagement/domain/recruiter-directory";

export function RecruiterEvidenceHistory({
  evidence,
}: {
  readonly evidence: readonly DirectoryEvidence[];
}) {
  return (
    <details className="recruiter-evidence-history">
      <summary>
        {evidence.length} retained public source{evidence.length === 1 ? "" : "s"}
      </summary>
      <ul>
        {evidence.map((item) => (
          <li key={item.id}>
            <a href={item.observation.evidence.sourceUrl} rel="noreferrer" target="_blank">
              {item.observation.evidence.sourceUrl}
            </a>
            <span>{item.observation.evidence.excerpt}</span>
            <small>
              Observed {item.observation.evidence.observedAt} ·{" "}
              {item.observation.evidence.confidence} confidence ·{" "}
              {item.observation.evidence.adapterId} v{item.observation.evidence.policyVersion} ·{" "}
              {item.runIds.length} run{item.runIds.length === 1 ? "" : "s"}
            </small>
            {item.observation.kind === "recruiter" && item.observation.workEmail ? (
              <div className="recruiter-work-email-evidence">
                <strong>Work email: {item.observation.workEmail.address}</strong>
                <a
                  href={item.observation.workEmail.evidence.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  Public email evidence
                </a>
                <small>
                  Observed {item.observation.workEmail.evidence.observedAt} ·{" "}
                  {item.observation.workEmail.evidence.confidence} confidence ·{" "}
                  {item.observation.workEmail.evidence.adapterId} v
                  {item.observation.workEmail.evidence.policyVersion}
                </small>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </details>
  );
}
