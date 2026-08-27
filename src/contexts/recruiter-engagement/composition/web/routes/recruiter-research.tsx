import { type ActionFunctionArgs, useActionData, useLoaderData } from "react-router";

import { recruiterEngagementWeb } from "@/contexts/recruiter-engagement/composition/recruiter-engagement-web.server";
import { RecruiterResearchPage } from "@/contexts/recruiter-engagement/presentation/web/recruiter-research-page";
import { recruiterResearchAction } from "./recruiter-research-action.server";

export async function loader({ request }: { readonly request: Request }) {
  const runId = new URL(request.url).searchParams.get("run");
  return {
    research: runId ? await recruiterEngagementWeb.getResearchRun(runId) : undefined,
    defaultBrief: recruiterEngagementWeb.getDefaultResearchBrief(),
    targetLocationOptions: recruiterEngagementWeb.getTargetLocationOptions(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  return recruiterResearchAction(request);
}

export default function RecruiterResearchRoute() {
  const { defaultBrief, research, targetLocationOptions } = useLoaderData<typeof loader>();
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
      defaultBrief={defaultBrief}
      targetLocationOptions={targetLocationOptions}
    />
  );
}
