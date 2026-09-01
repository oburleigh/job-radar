import type { FirmObservation } from "@/contexts/recruiter-engagement/domain/observation";
import type { ResearchRun } from "@/contexts/recruiter-engagement/domain/research-run";

export function firmDiscoveryInstructions(run: ResearchRun): string {
  const { criteria, description, firmTarget } = run.brief;
  return lines([
    `Research the ${firmTarget} best recruitment firms matching the brief below.`,
    "",
    labelled("Target locations", criteria.targetLocations),
    labelled("Specialisms", criteria.specialisms),
    labelled("Target industries", criteria.industries),
    description ? `Brief: ${description}` : "",
    "",
    "Rules:",
    `- Return at most ${firmTarget} firms. Returning fewer is correct when fewer genuinely match.`,
    "- A firm qualifies only when its own public website shows that it recruits for the",
    "  stated specialisms and operates in the stated target locations.",
    "- Read each firm's own site before including it. Do not rely on directory,",
    "  aggregator or listicle pages.",
    "- Give every firm a sourceUrl citing the page that evidences the claim, and an",
    "  excerpt quoted from that page.",
    "- Exclude a firm you cannot evidence. An omission is correct; a guess is not.",
    "",
    "Return the result using the supplied JSON schema and nothing else.",
  ]);
}

export function recruiterDiscoveryInstructions(
  run: ResearchRun,
  firms: readonly Pick<FirmObservation, "companyName" | "websiteUrl">[],
): string {
  const { criteria, recruiterTarget } = run.brief;
  return lines([
    `Find up to ${recruiterTarget} named recruiters working at the firms listed below.`,
    "",
    labelled(
      "Firms",
      firms.map((firm) => `${firm.companyName} (${firm.websiteUrl})`),
    ),
    labelled("Specialisms", criteria.specialisms),
    labelled("Target locations", criteria.targetLocations),
    "",
    "Rules:",
    `- Return at most ${recruiterTarget} recruiters across all of the firms.`,
    "- Include a recruiter only when a public page names them in a recruiting role at",
    "  one of the listed firms.",
    "- profileUrl is the recruiter's own public professional profile.",
    "- Give every recruiter a sourceUrl and an excerpt quoted from that page.",
    "- Do not collect personal contact details.",
    "",
    "Return the result using the supplied JSON schema and nothing else.",
  ]);
}

function labelled(label: string, values: readonly string[]): string {
  return values.length === 0 ? "" : `${label}: ${values.join(", ")}`;
}

function lines(parts: readonly string[]): string {
  return parts.filter((part, index) => part !== "" || parts[index - 1] !== "").join("\n");
}
