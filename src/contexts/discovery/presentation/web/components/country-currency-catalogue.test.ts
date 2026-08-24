import { describe, expect, it } from "vitest";

import {
  countryCurrencyOptions,
  countryOptionsMatching,
  currencyOptionsMatching,
  isIso4217Currency,
} from "./country-currency-catalogue";

describe("country and currency catalogue", () => {
  it("resolves a country to its primary ISO 4217 currency", () => {
    expect(countryCurrencyOptions.find((option) => option.countryCode === "AE")).toMatchObject({
      currencyCode: "AED",
    });
  });

  it.each([
    ["Iceland", "ISK", "IS"],
    ["Saint Lucia", "XCD", "LC"],
    ["Zambia", "ZMW", "ZM"],
    ["Botswana", "BWP", "BW"],
    ["Jordan", "JOD", "JO"],
    ["Bulgaria", "EUR", "BG"],
    ["Curaçao", "XCG", "CW"],
    ["Sint Maarten", "XCG", "SX"],
    ["Sierra Leone", "SLE", "SL"],
    ["Portugal", "EUR", "PT"],
  ])("resolves %s to %s", (countryName, currencyCode, countryOptionCode) => {
    expect(countryOptionsMatching(countryName)).toContainEqual(
      expect.objectContaining({ countryCode: countryOptionCode, currencyCode }),
    );
  });

  it("covers every ISO country except Antarctica plus Kosovo without duplicates", () => {
    expect(countryCurrencyOptions).toHaveLength(249);
    expect(new Set(countryCurrencyOptions.map((option) => option.countryCode)).size).toBe(249);
  });

  it("orders country choices by their displayed English name", () => {
    const options = countryOptionsMatching("");
    const alphabeticallySorted = [...options].sort(
      (left, right) =>
        left.countryName.localeCompare(right.countryName, "en") ||
        left.countryCode.localeCompare(right.countryCode),
    );

    expect(options).toEqual(alphabeticallySorted);
    expect(options[0]?.countryName).toBe("Afghanistan");
  });

  it("matches currency choices by ISO code, currency display name, and country name", () => {
    expect(currencyOptionsMatching("gbp").map((option) => option.currencyCode)).toContain("GBP");
    expect(currencyOptionsMatching("pound").map((option) => option.currencyCode)).toContain("GBP");
    expect(
      currencyOptionsMatching("united kingdom").map((option) => option.currencyCode),
    ).toContain("GBP");
  });

  it("offers every supported ISO 4217 currency, including codes without a country", () => {
    for (const currencyCode of ["ISK", "XCD", "ZMW", "BWP", "JOD", "XDR"]) {
      expect(isIso4217Currency(currencyCode)).toBe(true);
      expect(currencyOptionsMatching(currencyCode)).toContainEqual(
        expect.objectContaining({ currencyCode }),
      );
    }
  });

  it("accepts ISO 4217 values but rejects arbitrary three-letter text", () => {
    expect(isIso4217Currency("GBP")).toBe(true);
    expect(isIso4217Currency("ZZZ")).toBe(false);
  });
});
