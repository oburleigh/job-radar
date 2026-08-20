import type { AnnualSalaryRange } from "@/contexts/discovery/domain/annual-salary";

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

function formatAmount(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 0 }).format(value);
}
