import { describe, expect, it } from "vitest";

import { loader } from "./location-options";

describe("location options route", () => {
  it("returns canonical local suggestions for country aliases", async () => {
    const response = loader({
      request: new Request("http://localhost/api/location-options?q=UAE", {
        headers: { host: "localhost" },
      }),
    });

    await expect(response.json()).resolves.toMatchObject({
      options: [
        {
          countryCode: "AE",
          kind: "country",
          label: "United Arab Emirates",
        },
      ],
    });
  });

  it("returns the complete country catalogue for an empty browse request", async () => {
    const response = loader({
      request: new Request("http://localhost/api/location-options?q=", {
        headers: { host: "localhost" },
      }),
    });
    const body = (await response.json()) as { options: readonly { label: string }[] };

    expect(response.status).toBe(200);
    expect(body.options.length).toBeGreaterThan(200);
    expect(body.options.at(-1)?.label).toBe("Zimbabwe");
  });

  it("rejects non-local requests", () => {
    expect(() =>
      loader({
        request: new Request("http://example.com/api/location-options?q=Dubai", {
          headers: { host: "example.com" },
        }),
      }),
    ).toThrow("restricted to localhost");
  });
});
