import { z } from "zod";

import type { ForStartingDiscoveryRuns } from "../../../application/discovery-runs/start/start-discovery-run";

type StartDiscoveryRunRouteDependencies = {
  readonly assertLocalRequest: (request: Request) => void;
  readonly isProviderConfigured: (name: string) => boolean;
  readonly assertProviderReady: (name: string) => void;
  readonly discoveryRuns: ForStartingDiscoveryRuns;
};

const startSchema = z.object({
  profileId: z.number().int().positive(),
  provider: z.string().trim().min(1),
});

export function createStartDiscoveryRunRoute({
  assertLocalRequest,
  isProviderConfigured,
  assertProviderReady,
  discoveryRuns,
}: StartDiscoveryRunRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      assertLocalRequest(request);
      const input = startSchema.safeParse(await request.json());
      if (!input.success || !isProviderConfigured(input.data.provider)) {
        return Response.json({ ok: false, message: "Invalid discovery request." }, { status: 400 });
      }
      assertProviderReady(input.data.provider);

      const result = discoveryRuns.startDiscoveryRun({
        profileId: input.data.profileId,
        providerName: input.data.provider,
      });
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
