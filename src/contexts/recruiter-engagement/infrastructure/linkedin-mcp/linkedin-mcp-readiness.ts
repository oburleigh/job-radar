import { z } from "zod";

export type LinkedInMcpCapabilities = {
  readonly connect: boolean;
  readonly message: boolean;
  readonly search: boolean;
};

export type LinkedInMcpReadiness = {
  readonly accountId: string | null;
  readonly capabilities: LinkedInMcpCapabilities;
  readonly message: string;
  readonly status: "ready" | "attention-required" | "unavailable";
};

const sessionStatusSchema = z.object({
  account_id: z.string().trim().min(1),
  profile_present: z.boolean(),
  browser_setup_state: z.enum(["disabled", "not_started", "installing", "ready", "failed"]),
  browser_started: z.boolean(),
  authentication_state: z.enum([
    "unverified",
    "login_required",
    "login_in_progress",
    "validating",
    "authenticated",
    "attention_required",
  ]),
  automatic_login_enabled: z.boolean(),
  login_browser_open: z.boolean(),
  paused: z.boolean(),
  pause_reason: z.string().nullable(),
  status_message: z.string().trim().min(1).nullable(),
});

const capabilityListSchema = z.object({
  capabilities: z.array(
    z.object({
      name: z.string().trim().min(1),
      enabled: z.boolean(),
    }),
  ),
});

const capabilityGroups = {
  connect: ["linkedin.invitations.send.prepare", "linkedin.invitations.send.execute"],
  message: ["linkedin.messaging.message.prepare", "linkedin.messaging.message.execute"],
  search: [
    "linkedin.companies.search",
    "linkedin.companies.get",
    "linkedin.people.search",
    "linkedin.people.get",
  ],
} as const;

const unavailableCapabilities: LinkedInMcpCapabilities = {
  connect: false,
  message: false,
  search: false,
};

export interface LinkedInMcpToolClient {
  readonly close: () => Promise<void>;
  readonly callTool: (name: string, input?: Readonly<Record<string, unknown>>) => Promise<unknown>;
}
export async function readLinkedInMcpReadiness(
  client: LinkedInMcpToolClient,
): Promise<LinkedInMcpReadiness> {
  try {
    const session = sessionStatusSchema.parse(await client.callTool("linkedin.session.status"));
    const capabilityList = capabilityListSchema.parse(
      await client.callTool("linkedin.capabilities.list"),
    );
    const enabledNames = new Set(
      capabilityList.capabilities
        .filter((capability) => capability.enabled)
        .map((capability) => capability.name),
    );
    const capabilities = {
      connect: capabilityGroups.connect.every((name) => enabledNames.has(name)),
      message: capabilityGroups.message.every((name) => enabledNames.has(name)),
      search: capabilityGroups.search.every((name) => enabledNames.has(name)),
    };

    if (
      session.authentication_state !== "authenticated" ||
      session.paused ||
      session.browser_setup_state !== "ready" ||
      !session.profile_present
    ) {
      return {
        accountId: session.account_id,
        capabilities,
        message: session.status_message ?? "Restore the LinkedIn session to continue.",
        status: "attention-required" as const,
      };
    }

    if (!capabilities.search) {
      return {
        accountId: session.account_id,
        capabilities,
        message: "The LinkedIn MCP server is missing required Recruiter Search capabilities.",
        status: "unavailable" as const,
      };
    }

    return {
      accountId: session.account_id,
      capabilities,
      message: "LinkedIn is ready for Recruiter Search.",
      status: "ready" as const,
    };
  } catch {
    return {
      accountId: null,
      capabilities: unavailableCapabilities,
      message: "The LinkedIn MCP server returned an invalid readiness response.",
      status: "unavailable" as const,
    };
  } finally {
    await client.close();
  }
}
