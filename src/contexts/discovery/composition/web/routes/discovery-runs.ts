import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { z } from "zod";
import { discoveryRunsWeb } from "@/contexts/discovery/composition/discovery-runs.server";
import { createCancelDiscoveryRunRoute } from "@/contexts/discovery/presentation/web/http/cancel-discovery-run";
import { createStartDiscoveryRunRoute } from "@/contexts/discovery/presentation/web/http/start-discovery-run";
import { assertLocalHost } from "@/platform/http/require-local-request";

const startDiscoveryRun = createStartDiscoveryRunRoute({
  assertLocalRequest: (request) => assertLocalHost(request.headers.get("host") ?? ""),
  isProviderConfigured: discoveryRunsWeb.isProviderConfigured,
  assertProviderReady: discoveryRunsWeb.assertProviderReady,
  discoveryRuns: { startDiscoveryRun: discoveryRunsWeb.startDiscoveryRun },
});
const cancelDiscoveryRun = createCancelDiscoveryRunRoute({
  assertLocalRequest: (request) => assertLocalHost(request.headers.get("host") ?? ""),
  discoveryRuns: { cancelDiscoveryRun: discoveryRunsWeb.cancelDiscoveryRun },
});

const idsSchema = z
  .string()
  .transform((value) =>
    value
      .split(",")
      .map((item) => Number.parseInt(item, 10))
      .filter((item) => Number.isInteger(item) && item > 0),
  )
  .pipe(z.array(z.number().int().positive()).max(25));

export async function loader({ request }: LoaderFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  discoveryRunsWeb.failStale();
  const url = new URL(request.url);
  const idsParam = url.searchParams.get("ids");
  const activeOnly = url.searchParams.get("active") === "1";
  const parsedIds = idsParam ? idsSchema.safeParse(idsParam) : null;
  if (parsedIds && !parsedIds.success) {
    return Response.json({ message: "Invalid discovery run ids." }, { status: 400 });
  }
  if (!parsedIds && !activeOnly) {
    return Response.json({ message: "Request run ids or active runs." }, { status: 400 });
  }

  return Response.json(
    discoveryRunsWeb.readStatuses({
      ids: parsedIds?.data ?? [],
      activeOnly,
    }),
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function action({ request }: ActionFunctionArgs) {
  return request.method === "DELETE" ? cancelDiscoveryRun(request) : startDiscoveryRun(request);
}
