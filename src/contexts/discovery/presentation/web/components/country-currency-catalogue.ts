import countryToCurrency from "country-to-currency";

export interface CountryCurrencyOption {
  readonly countryCode: string;
  readonly countryName: string;
  readonly currencyCode: string;
  readonly currencyName: string;
}

export interface CurrencyOption {
  readonly currencyCode: string;
  readonly currencyName: string;
  readonly countryNames: readonly string[];
}

const excludedCountryCodes = new Set([
  "AN", // Legacy Netherlands Antilles code retained by the package for compatibility.
  "AQ", // Antarctica has no primary currency.
]);

const countryNames = new Intl.DisplayNames("en", { type: "region" });
const currencyNames = new Intl.DisplayNames("en", { type: "currency" });
const countryNameCollator = new Intl.Collator("en");
const supportedCurrencyCodes = new Set(Intl.supportedValuesOf("currency"));

export const countryCurrencyOptions: readonly CountryCurrencyOption[] = Object.entries(
  countryToCurrency,
)
  .filter(([countryCode]) => !excludedCountryCodes.has(countryCode))
  .map(([countryCode, currencyCode]) => ({
    countryCode,
    countryName: countryNames.of(countryCode) ?? countryCode,
    currencyCode,
    currencyName: currencyNames.of(currencyCode) ?? currencyCode,
  }))
  .sort(
    (left, right) =>
      countryNameCollator.compare(left.countryName, right.countryName) ||
      left.countryCode.localeCompare(right.countryCode),
  );

export const currencyOptions: readonly CurrencyOption[] = Intl.supportedValuesOf("currency")
  .map((currencyCode) => ({
    currencyCode,
    currencyName: currencyNames.of(currencyCode) ?? currencyCode,
    countryNames: countryCurrencyOptions
      .filter((option) => option.currencyCode === currencyCode)
      .map((option) => option.countryName),
  }))
  .sort((left, right) => left.currencyCode.localeCompare(right.currencyCode));

export function isIso4217Currency(value: string): boolean {
  return /^[A-Z]{3}$/.test(value) && supportedCurrencyCodes.has(value);
}

export function countryOptionsMatching(value: string): readonly CountryCurrencyOption[] {
  const query = normalize(value);
  return countryCurrencyOptions.filter(
    (option) => query === "" || normalize(option.countryName).includes(query),
  );
}

export function currencyOptionsMatching(value: string): readonly CurrencyOption[] {
  const query = normalize(value);
  return currencyOptions.filter(
    (option) =>
      query === "" ||
      normalize(option.currencyCode).includes(query) ||
      normalize(option.currencyName).includes(query) ||
      option.countryNames.some((countryName) => normalize(countryName).includes(query)),
  );
}

function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\bsaint\b/g, "st")
    .replace(/[.'’]/g, "");
}
