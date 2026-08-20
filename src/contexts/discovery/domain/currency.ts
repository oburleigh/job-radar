declare const currencyBrand: unique symbol;

export type Currency = string & { readonly [currencyBrand]: "Currency" };

export function currencyFrom(value: string): Currency | null {
  const normalized = value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(normalized) ? (normalized as Currency) : null;
}
