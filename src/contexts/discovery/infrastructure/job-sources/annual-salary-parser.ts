import {
  type AnnualSalaryRange,
  createAnnualSalaryRange,
} from "@/contexts/discovery/domain/annual-salary";

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

export function extractAnnualSalaryFromText(text: string): AnnualSalaryRange | null {
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
    const range = createAnnualSalaryRange(
      currency,
      parseAmount(groups.min),
      parseAmount(groups.max),
    );
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
    const value = parseAmount(groups.value);
    const range = createAnnualSalaryRange(
      commonCurrency(groups.currencyA, groups.currencyB),
      value,
      value,
    );
    if (range) {
      return range;
    }
  }

  return null;
}

function commonCurrency(...values: ReadonlyArray<string | undefined>): string {
  const currencies = values.map(normalizeCurrencyToken).filter(Boolean);
  if (currencies.length === 0) {
    return "";
  }
  return currencies.every((currency) => currency === currencies[0]) ? (currencies[0] ?? "") : "";
}

function normalizeCurrencyToken(value: string | undefined): string {
  const currency = value?.trim().toUpperCase() ?? "";
  const symbols: Readonly<Record<string, string>> = {
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
  return symbols[currency] ?? currency;
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
