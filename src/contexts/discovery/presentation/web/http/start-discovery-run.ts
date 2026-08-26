import { z } from "zod";

import type { ForStartingDiscoveryRuns } from "@/contexts/discovery/application/discovery-runs/start/start-discovery-run";

type StartDiscoveryRunRouteDependencies = {
  readonly assertLocalRequest: (request: Request) => void;
  readonly isProviderKnown: (name: string) => boolean;
  readonly isProviderConfigured: (name: string) => boolean;
  readonly assertProviderReady: (name: string) => void;
  readonly discoveryRuns: ForStartingDiscoveryRuns;
};

const startSchema = z.object({
  profileId: z.number().int().positive(),
  provider: z.string().trim().min(1).optional(),
});

export function createStartDiscoveryRunRoute({
  assertLocalRequest,
  isProviderKnown,
  isProviderConfigured,
  assertProviderReady,
  discoveryRuns,
}: StartDiscoveryRunRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      assertLocalRequest(request);
      const input = startSchema.safeParse(await request.json());
      if (!input.success || (input.data.provider && !isProviderKnown(input.data.provider))) {
        return Response.json({ ok: false, message: "Invalid discovery request." }, { status: 400 });
      }
      const providerName =
        input.data.provider && isProviderConfigured(input.data.provider)
          ? input.data.provider
          : null;
      if (providerName) {
        assertProviderReady(providerName);
      }

      const result = discoveryRuns.startDiscoveryRun({
        profileId: input.data.profileId,
        providerName,
      });
      if (result.status === "not-runnable") {
        return Response.json(
          {
            ok: false,
            message:
              "Enable a company board or configure a web search provider before running discovery.",
          },
          { status: 400 },
        );
      }
      const alreadyRunning = result.status === "already-running";
      return Response.json(
        {
          ok: true,
          runId: result.runId,
          alreadyRunning,
          message: alreadyRunning
            ? `Discovery #${result.runId} is already running for this profile.`
            : `Discovery #${result.runId} is running in the background. You can keep using the app.`,
        },
        { status: alreadyRunning ? 200 : 202 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ ok: false, message }, { status: 400 });
    }
  };
}
