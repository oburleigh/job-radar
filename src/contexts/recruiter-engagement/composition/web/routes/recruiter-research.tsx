import { type ActionFunctionArgs, useActionData, useLoaderData } from "react-router";

import { recruiterEngagementWeb } from "@/contexts/recruiter-engagement/composition/recruiter-engagement-web.server";
import { RecruiterResearchPage } from "@/contexts/recruiter-engagement/presentation/web/recruiter-research-page";
import { resolveLocations } from "@/platform/locations/location-search.server";
import { recruiterResearchAction } from "./recruiter-research-action.server";

export async function loader({ request }: { readonly request: Request }) {
  const runId = new URL(request.url).searchParams.get("run");
  const research = runId ? await recruiterEngagementWeb.getResearchRun(runId) : undefined;
  return {
    research,
    defaultTargets: recruiterEngagementWeb.getDefaultSearchTargets(),
    execution: recruiterEngagementWeb.getResearchExecutionSettings(),
    initialLocationOptions: resolveLocations(research?.run.brief.criteria.targetLocations ?? []),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  return recruiterResearchAction(request);
}

export default function RecruiterResearchRoute() {
  const { defaultTargets, execution, initialLocationOptions, research } =
    useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  return (
    <RecruiterResearchPage
      {...(actionData?.error
        ? {
            actionError: {
              ...(actionData.field ? { field: actionData.field } : {}),
              message: actionData.error,
            },
          }
        : {})}
      {...(research ? { research } : {})}
      defaultTargets={defaultTargets}
      execution={execution}
      initialLocationOptions={initialLocationOptions}
    />
  );
}
