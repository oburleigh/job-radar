export interface AnnualSalaryRange {
  currency: string;
  min: number | null;
  max: number | null;
}

const CURRENCY_TOKEN = String.raw`(?:US\$|CA\$|C\$|AU\$|A\$|NZ\$|S\$|GBP|USD|EUR|AED|CAD|AUD|NZD|SGD|CHF|£|€|\$)`;
const AMOUNT_TOKEN = String.raw`(?:\d{1,3}(?:[,\s]\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s*[kK])`;
const SALARY_CONTEXT = String.raw`(?:base\s+salary|salary(?:\s+range)?|base\s+pay|pay\s+range|annual\s+pay|compensation)`;
const RANGE_PATTERN = new RegExp(
  String.raw`${SALARY_CONTEXT}[^£€$\d]{0,80}(?<currencyA>${CURRENCY_TOKEN})?\s*(?<min>${AMOUNT_TOKEN})\s*(?:-|–|—|to)\s*(?<currencyB>${CURRENCY_TOKEN})?\s*(?<max>${AMOUNT_TOKEN})(?:\s*(?<currencyC>${CURRENCY_TOKEN}))?`,
  "gi",
);
const SINGLE_PATTERN = new RegExp(
  String.raw`${SALARY_CONTEXT}[^£€$\d]{0,80}(?<currencyA>${CURRENCY_TOKEN})?\s*(?<value>${AMOUNT_TOKEN})(?:\s*(?<currencyB>${CURRENCY_TOKEN}))?`,
  "gi",
);

export function extractAnnualSalary(
  description: string,
  rawPayload: Record<string, unknown> = {},
): AnnualSalaryRange | null {
  return (
    extractStructuredSalary(rawPayload) ??
    extractSalaryFromText(description) ??
    extractAshbySalarySummary(rawPayload)
  );
}

export function formatAnnualSalary(range: AnnualSalaryRange): string {
  const min = range.min === null ? "" : formatAmount(range.min);
  const max = range.max === null ? "" : formatAmount(range.max);
  const amount =
    min && max
      ? min === max
        ? min
        : `${min}-${max}`
      : min
        ? `${min}+`
        : max
          ? `up to ${max}`
          : "";

  return amount ? `${range.currency} ${amount}` : range.currency;
}

function extractStructuredSalary(rawPayload: Record<string, unknown>): AnnualSalaryRange | null {
  const compensation = asRecord(rawPayload.compensation);
  const components = recordArray(compensation.summaryComponents).filter(
    (component) =>
      stringValue(component.compensationType).toLowerCase() === "salary" &&
      stringValue(component.interval).toLowerCase().includes("year"),
  );
  const firstCurrency = components
    .map((component) => normalizeCurrency(component.currencyCode))
    .find(Boolean);
  if (!firstCurrency) {
    return null;
  }

  const comparable = components.filter(
    (component) => normalizeCurrency(component.currencyCode) === firstCurrency,
  );
  const minimums = comparable
    .map((component) => numberValue(component.minValue))
    .filter((value): value is number => value !== null);
  const maximums = comparable
    .map((component) => numberValue(component.maxValue))
    .filter((value): value is number => value !== null);

  return salaryRange(
    firstCurrency,
    minimums.length > 0 ? Math.min(...minimums) : null,
    maximums.length > 0 ? Math.max(...maximums) : null,
  );
}

function extractAshbySalarySummary(rawPayload: Record<string, unknown>): AnnualSalaryRange | null {
  const compensation = asRecord(rawPayload.compensation);
  const summary = stringValue(compensation.scrapeableCompensationSalarySummary);
  return summary ? extractSalaryFromText(`Salary range ${summary}`) : null;
}

function extractSalaryFromText(text: string): AnnualSalaryRange | null {
  RANGE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(RANGE_PATTERN)) {
    const start = match.index ?? 0;
    if (!isAnnualContext(text, start, start + match[0].length)) {
      continue;
    }
    const groups = match.groups ?? {};
    const currency = commonCurrency(groups.currencyA, groups.currencyB, groups.currencyC);
    if (!currency) {
      continue;
    }
    const min = parseAmount(groups.min);
    const max = parseAmount(groups.max);
    const range = salaryRange(currency, min, max);
    if (range) {
      return range;
    }
  }

  SINGLE_PATTERN.lastIndex = 0;
  for (const match of text.matchAll(SINGLE_PATTERN)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (!isAnnualContext(text, start, end) || /^\s*(?:-|–|—|to)\s*/i.test(text.slice(end))) {
      continue;
    }
    const groups = match.groups ?? {};
    const currency = commonCurrency(groups.currencyA, groups.currencyB);
    const value = parseAmount(groups.value);
    const range = salaryRange(currency, value, value);
    if (range) {
      return range;
    }
  }

  return null;
}

function salaryRange(
  currency: string,
  min: number | null,
  max: number | null,
): AnnualSalaryRange | null {
  if (!currency || (min === null && max === null)) {
    return null;
  }
  if (min !== null && max !== null && min > max) {
    return { currency, min: max, max: min };
  }
  return { currency, min, max };
}

function commonCurrency(...rawValues: (string | undefined)[]): string {
  const currencies = rawValues.map(normalizeCurrency).filter(Boolean);
  if (currencies.length === 0) {
    return "";
  }
  return currencies.every((currency) => currency === currencies[0]) ? (currencies[0] ?? "") : "";
}

function normalizeCurrency(value: unknown): string {
  const currency = stringValue(value).trim().toUpperCase();
  const symbols: Record<string, string> = {
    $: "USD",
    US$: "USD",
    CA$: "CAD",
    C$: "CAD",
    AU$: "AUD",
    A$: "AUD",
    NZ$: "NZD",
    S$: "SGD",
    "£": "GBP",
    "€": "EUR",
  };
  return symbols[currency] ?? (/^[A-Z]{3}$/.test(currency) ? currency : "");
}

function parseAmount(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const normalized = value.replace(/[,\s]/g, "").toLowerCase();
  const multiplier = normalized.endsWith("k") ? 1_000 : 1;
  const amount = Number.parseFloat(normalized.replace(/k$/, "")) * multiplier;
  if (!Number.isFinite(amount) || amount < 10_000 || amount > 100_000_000) {
    return null;
  }
  return Math.round(amount);
}

function isAnnualContext(text: string, start: number, end: number): boolean {
  const context = text.slice(start, end + 40).toLowerCase();
  return !/(?:per|\/)\s*(?:hour|day|week|month)\b|\bhourly\b/.test(context);
}

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
