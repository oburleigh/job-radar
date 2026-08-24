import { describe, expect, it } from "vitest";
import { resolveJobSelection } from "./resolve-job-selection";

const providers = [
  { name: "brave", configured: false },
  { name: "serper", configured: true },
];

describe("resolveJobSelection", () => {
  it("canonicalizes a missing URL pair to the visible profile and configured provider", () => {
    expect(resolveJobSelection(new URL("http://localhost/?state=new"), 7, providers)).toEqual({
      profileId: 7,
      provider: "serper",
      redirectTo: "/?state=new&profile=7&provider=serper",
    });
  });

  it("replaces invalid selections with the pair actually rendered", () => {
    expect(
      resolveJobSelection(
        new URL("http://localhost/?profile=999&provider=missing&q=platform"),
        7,
        providers,
      ),
    ).toEqual({
      profileId: 7,
      provider: "serper",
      redirectTo: "/?profile=7&provider=serper&q=platform",
    });
  });

  it("keeps an existing valid pair without redirecting", () => {
    expect(
      resolveJobSelection(new URL("http://localhost/?profile=7&provider=brave"), 7, providers),
    ).toEqual({ profileId: 7, provider: "brave" });
  });

  it("does not invent a provider selection when no profile can be rendered", () => {
    expect(resolveJobSelection(new URL("http://localhost/"), undefined, providers)).toEqual({});
  });
});
