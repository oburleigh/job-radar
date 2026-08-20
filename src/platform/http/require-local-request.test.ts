import { afterEach, describe, expect, it } from "vitest";

import { assertLocalHost } from "./require-local-request";

const originalAllowRemoteUi = process.env.ALLOW_REMOTE_UI;

afterEach(() => {
  if (originalAllowRemoteUi === undefined) {
    delete process.env.ALLOW_REMOTE_UI;
  } else {
    process.env.ALLOW_REMOTE_UI = originalAllowRemoteUi;
  }
});

describe("local request guard", () => {
  it.each(["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])("allows local host %s", (host) => {
    delete process.env.ALLOW_REMOTE_UI;
    expect(() => assertLocalHost(host)).not.toThrow();
  });

  it("rejects a remote host by default", () => {
    delete process.env.ALLOW_REMOTE_UI;
    expect(() => assertLocalHost("jobs.example.com")).toThrow(
      "Mutations are restricted to localhost",
    );
  });

  it("allows an explicitly enabled remote UI", () => {
    process.env.ALLOW_REMOTE_UI = "1";
    expect(() => assertLocalHost("jobs.example.com")).not.toThrow();
  });
});
