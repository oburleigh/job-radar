import { type Currency, currencyFrom } from "./currency";

export interface AnnualSalaryRange {
  readonly currency: Currency;
  readonly min: number | null;
  readonly max: number | null;
}

export type SalaryPreferenceRelation = "above" | "below" | "not-comparable" | "overlaps";

export function createAnnualSalaryRange(
  rawCurrency: string,
  rawMin: number | null,
  rawMax: number | null,
): AnnualSalaryRange | null {
  const currency = currencyFrom(rawCurrency);
  const min = validAnnualAmount(rawMin);
  const max = validAnnualAmount(rawMax);
  if (!currency || (min === null && max === null)) {
    return null;
  }
  return min !== null && max !== null && min > max
    ? { currency, min: max, max: min }
    : { currency, min, max };
}

export function compareAnnualSalary(
  salary: AnnualSalaryRange | null,
  preference: {
    readonly currency: Currency | null;
    readonly min: number | null;
    readonly max: number | null;
  },
): SalaryPreferenceRelation {
  if (!salary || preference.currency === null || salary.currency !== preference.currency) {
    return "not-comparable";
  }
  if (preference.min !== null && salary.max !== null && salary.max < preference.min) {
    return "below";
  }
  if (preference.max !== null && salary.min !== null && salary.min > preference.max) {
    return "above";
  }
  return "overlaps";
}

function validAnnualAmount(value: number | null): number | null {
  return value !== null && Number.isSafeInteger(value) && value >= 10_000 && value <= 100_000_000
    ? value
    : null;
}
