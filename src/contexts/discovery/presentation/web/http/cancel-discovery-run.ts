import { z } from "zod";

import type { ForCancellingDiscoveryRuns } from "@/contexts/discovery/application/discovery-runs/cancel/cancel-discovery-run";

type CancelDiscoveryRunRouteDependencies = {
  readonly assertLocalRequest: (request: Request) => void;
  readonly discoveryRuns: ForCancellingDiscoveryRuns;
};

const cancelSchema = z.object({
  runId: z.number().int().positive(),
});

export function createCancelDiscoveryRunRoute({
  assertLocalRequest,
  discoveryRuns,
}: CancelDiscoveryRunRouteDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      assertLocalRequest(request);
      const input = cancelSchema.safeParse(await request.json());
      if (!input.success) {
        return Response.json(
          { ok: false, status: "invalid-request", message: "Invalid discovery run id." },
          { status: 400 },
        );
      }

      const result = discoveryRuns.cancelDiscoveryRun({ runId: input.data.runId });
      if (result.status === "not-found") {
        return Response.json(
          {
            ok: false,
            status: result.status,
            runId: result.runId,
            message: "Discovery run not found.",
          },
          { status: 404 },
        );
      }
      if (result.status === "already-terminal") {
        return Response.json(
          {
            ok: true,
            status: result.status,
            runId: result.runId,
            terminalStatus: result.terminalStatus,
            message: `Discovery #${result.runId} is already ${result.terminalStatus}.`,
          },
          { status: 200 },
        );
      }
      return Response.json(
        {
          ok: true,
          status: result.status,
          runId: result.runId,
          message: `Discovery #${result.runId} was cancelled.`,
        },
        { status: 200 },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return Response.json({ ok: false, status: "error", message }, { status: 400 });
    }
  };
}
