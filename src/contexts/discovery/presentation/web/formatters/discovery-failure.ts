import { STALE_DISCOVERY_RUN_CODE } from "@/contexts/discovery/domain/stale-discovery-run";

interface DiscoveryFailure {
  readonly profileName: string;
  readonly provider: string;
  readonly errorSummary: string;
}

export function formatDiscoveryFailure({
  profileName,
  provider,
  errorSummary,
}: DiscoveryFailure): string {
  const summary = errorSummary.trim();
  if (!summary) {
    return `${profileName} did not finish. Review run history for details.`;
  }

  if (summary === STALE_DISCOVERY_RUN_CODE) {
    return "The local app stopped receiving progress from this discovery. Start a new run to retry.";
  }

  const providerName = formatProviderName(provider);
  if (/credit-exhausted|not enough credits|insufficient credits|quota exceeded/i.test(summary)) {
    return `${providerName} has no credits remaining. Choose another provider or add credits.`;
  }
  if (/payment-required/i.test(summary)) {
    return `${providerName} requires payment. Choose another provider or update its plan.`;
  }
  if (/http 429|rate[- ]limit/i.test(summary)) {
    return `${providerName} rate limit reached. Wait before retrying or choose another provider.`;
  }
  if (/server-error/i.test(summary)) {
    const attemptPhrase = summary.match(/\bafter \d+ attempts?\b/i)?.[0] ?? "";
    return `${providerName} was unavailable${attemptPhrase ? ` ${attemptPhrase}` : ""}. Try again later or choose another provider.`;
  }
  if (/authentication-rejected|http (401|403)|unauthori[sz]ed|invalid api key/i.test(summary)) {
    return `${providerName} rejected its API key. Check the credential in .env or choose another provider.`;
  }

  const detail = stripProviderTransport(stripQueryContext(summary), providerName);
  return `${withTerminalPunctuation(detail)} Try again or review run history for details.`;
}

function formatProviderName(provider: string): string {
  if (provider === "serper") return "Serper.dev";
  if (provider === "brave") return "Brave Search";
  if (provider === "serpapi") return "SerpAPI";
  return provider;
}

function stripQueryContext(summary: string): string {
  const contextSeparator = summary.indexOf(" / ");
  const messageSeparator = summary.indexOf(": ");
  return contextSeparator >= 0 && messageSeparator > contextSeparator
    ? summary.slice(messageSeparator + 2)
    : summary;
}

function stripProviderTransport(summary: string, providerName: string): string {
  const prefix = `${providerName} returned HTTP `;
  const detailSeparator = summary.indexOf(": ", prefix.length);
  return summary.startsWith(prefix) && detailSeparator >= 0
    ? `${providerName}: ${summary.slice(detailSeparator + 2)}`
    : summary;
}

function withTerminalPunctuation(message: string): string {
  return /[.!?]$/.test(message) ? message : `${message}.`;
}
