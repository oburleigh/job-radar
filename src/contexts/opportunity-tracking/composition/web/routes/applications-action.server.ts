import type {
  StartApplicationCommand,
  StartApplicationResult,
} from "@/contexts/opportunity-tracking/application/opportunity-workflow";
import { parseStartApplicationRequest } from "@/contexts/opportunity-tracking/presentation/web/requests/start-application-request";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function createApplicationsAction(dependencies: {
  readonly startApplication: (command: StartApplicationCommand) => StartApplicationResult;
}) {
  return async (request: Request) => {
    assertLocalHost(request.headers.get("host") ?? "");
    const parsed = parseStartApplicationRequest(await request.formData());
    if (!parsed.ok) return parsed;

    const result = dependencies.startApplication(parsed.command);
    if (result.status === "opportunity-not-found") {
      return { ok: false as const, message: "This Opportunity is no longer available to start." };
    }
    return {
      ok: true as const,
      applicationId: result.application.id,
      status: result.status,
      message: result.status === "created" ? "Application started." : "Application already exists.",
    };
  };
}
