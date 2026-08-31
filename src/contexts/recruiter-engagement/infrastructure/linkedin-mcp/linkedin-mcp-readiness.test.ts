import { describe, expect, it, vi } from "vitest";

import { readLinkedInMcpReadiness } from "./linkedin-mcp-readiness";

const requiredCapabilities = [
  "linkedin.companies.search",
  "linkedin.companies.get",
  "linkedin.people.search",
  "linkedin.people.get",
  "linkedin.invitations.send.prepare",
  "linkedin.invitations.send.execute",
  "linkedin.messaging.message.prepare",
  "linkedin.messaging.message.execute",
] as const;

describe("LinkedIn MCP adapter readiness", () => {
  it("reports the authenticated account and all supported user capabilities", async () => {
    const client = clientReturning(
      sessionStatus({ authentication_state: "authenticated" }),
      capabilityList(requiredCapabilities),
    );
    await expect(readLinkedInMcpReadiness(client)).resolves.toEqual({
      accountId: "personal-linkedin",
      capabilities: { connect: true, message: true, search: true },
      message: "LinkedIn is ready for Recruiter Search.",
      status: "ready",
    });
    expect(client.close).toHaveBeenCalledOnce();
  });

  it("requires the user to restore an expired LinkedIn session", async () => {
    const readiness = readLinkedInMcpReadiness(
      clientReturning(
        sessionStatus({
          authentication_state: "login_required",
          paused: true,
          pause_reason: "authentication_required",
          status_message: "Sign in to LinkedIn to continue.",
        }),
        capabilityList(requiredCapabilities),
      ),
    );

    await expect(readiness).resolves.toEqual({
      accountId: "personal-linkedin",
      capabilities: { connect: true, message: true, search: true },
      message: "Sign in to LinkedIn to continue.",
      status: "attention-required",
    });
  });

  it("does not call an incomplete MCP integration ready for search", async () => {
    const readiness = readLinkedInMcpReadiness(
      clientReturning(
        sessionStatus({ authentication_state: "authenticated" }),
        capabilityList(requiredCapabilities.filter((name) => name !== "linkedin.people.get")),
      ),
    );

    await expect(readiness).resolves.toEqual({
      accountId: "personal-linkedin",
      capabilities: { connect: true, message: true, search: false },
      message: "The LinkedIn MCP server is missing required Recruiter Search capabilities.",
      status: "unavailable",
    });
  });

  it("fails closed when the MCP server returns malformed session data", async () => {
    const readiness = readLinkedInMcpReadiness(
      clientReturning(
        { account_id: "personal-linkedin", authentication_state: "authenticated" },
        capabilityList(requiredCapabilities),
      ),
    );

    await expect(readiness).resolves.toEqual({
      accountId: null,
      capabilities: { connect: false, message: false, search: false },
      message: "The LinkedIn MCP server returned an invalid readiness response.",
      status: "unavailable",
    });
  });
});

function clientReturning(session: unknown, capabilities: unknown) {
  return {
    close: vi.fn(async () => undefined),
    callTool: vi.fn(async (name: string) => {
      if (name === "linkedin.session.status") return session;
      if (name === "linkedin.capabilities.list") return capabilities;
      throw new Error(`Unexpected tool: ${name}`);
    }),
  };
}

function sessionStatus(
  overrides: Partial<{
    readonly authentication_state:
      | "unverified"
      | "login_required"
      | "login_in_progress"
      | "validating"
      | "authenticated"
      | "attention_required";
    readonly pause_reason: string | null;
    readonly paused: boolean;
    readonly status_message: string | null;
  }> = {},
) {
  return {
    account_id: "personal-linkedin",
    profile_present: true,
    browser_setup_state: "ready",
    browser_started: true,
    authentication_state: "unverified",
    automatic_login_enabled: true,
    login_browser_open: false,
    paused: false,
    pause_reason: null,
    status_message: null,
    ...overrides,
  };
}

function capabilityList(names: readonly string[]) {
  return {
    capabilities: names.map((name) => ({
      name,
      version: "1",
      effect: name.endsWith(".execute") ? "write" : "read",
      required_surfaces: ["people-search"],
      required_scopes: [name],
      enabled: true,
      disabled_reason: null,
    })),
  };
}
