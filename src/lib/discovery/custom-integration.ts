export interface SuggestedSearchIntegration {
  atsType: string;
  label: string;
  hostname: string;
  pattern: string;
}

const SECOND_LEVEL_PUBLIC_SUFFIXES = new Set(["ac", "co", "com", "edu", "gov", "net", "org"]);

export function suggestSearchIntegration(
  rawUrl: string,
  existingIds: Iterable<string>,
): SuggestedSearchIntegration {
  const hostname = new URL(rawUrl).hostname.replace(/^www\./, "").toLowerCase();
  const parts = hostname.split(".").filter(Boolean);
  const candidateIndex =
    parts.length >= 3 &&
    SECOND_LEVEL_PUBLIC_SUFFIXES.has(parts.at(-2) ?? "") &&
    (parts.at(-1)?.length ?? 0) === 2
      ? parts.length - 3
      : Math.max(parts.length - 2, 0);
  const domainLabel = parts[candidateIndex] ?? "custom";
  const baseId =
    sanitizeId(domainLabel) || sanitizeId(parts.find((part) => part.length >= 2) ?? "") || "custom";
  const ids = new Set(existingIds);
  let atsType = baseId.length >= 2 ? baseId : `${baseId}-jobs`;
  let suffix = 2;
  while (ids.has(atsType)) {
    const suffixText = `-${suffix}`;
    atsType = `${baseId.slice(0, 40 - suffixText.length)}${suffixText}`;
    suffix += 1;
  }

  return {
    atsType,
    label: titleCase(domainLabel),
    hostname,
    pattern: hostname,
  };
}

function sanitizeId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^[^a-z]+/, "")
    .replace(/-+$/, "")
    .slice(0, 40);
}

function titleCase(value: string): string {
  return (
    value
      .split(/[-_]+/)
      .filter(Boolean)
      .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
      .join(" ") || "Custom ATS"
  );
}
