import { describe, expect, it } from "vitest";

import { currencyFrom } from "./currency";

describe("currency", () => {
  it("normalizes a three-letter currency code", () => {
    expect(currencyFrom(" gbp ")).toBe("GBP");
  });

  it.each(["", "US", "USDD", "U1D", "£££"])("rejects invalid currency code %j", (value) => {
    expect(currencyFrom(value)).toBeNull();
  });
});
