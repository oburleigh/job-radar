export type Evidence = {
  readonly adapterId: string;
  readonly confidence: "high" | "medium" | "low";
  readonly excerpt: string;
  readonly observedAt: string;
  readonly policyVersion: string;
  readonly sourceUrl: string;
};

export type FirmObservation = {
  readonly kind: "firm";
  readonly companyName: string;
  readonly websiteUrl: string;
  readonly reason: string;
  readonly industries: readonly string[];
  readonly specialisms: readonly string[];
  readonly evidence: Evidence;
};

export type RecruiterObservation = {
  readonly kind: "recruiter";
  readonly name: string;
  readonly title: string;
  readonly companyName: string;
  readonly linkedInUrl: string;
  readonly evidence: Evidence;
  readonly workEmail?:
    | {
        readonly address: string;
        readonly evidence: Evidence;
      }
    | undefined;
};

export type ResearchObservation = FirmObservation | RecruiterObservation;

export function observationIdentity(observation: ResearchObservation): string {
  if (observation.kind === "firm") {
    return `firm:${normaliseUrl(observation.websiteUrl)}`;
  }
  return `recruiter:${normaliseUrl(observation.linkedInUrl)}`;
}

function normaliseUrl(value: string): string {
  const url = new URL(value);
  return `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${url.pathname.replace(/\/$/, "")}`;
}
