import { type ActionFunctionArgs, useActionData, useLoaderData } from "react-router";

import { recruiterEngagementWeb } from "@/contexts/recruiter-engagement/composition/recruiter-engagement-web.server";
import { RecruiterResearchPage } from "@/contexts/recruiter-engagement/presentation/web/recruiter-research-page";
import { resolveLocations } from "@/platform/locations/location-search.server";
import { recruiterResearchAction } from "./recruiter-research-action.server";

export async function loader({ request }: { readonly request: Request }) {
  const parameters = new URL(request.url).searchParams;
  const runId = parameters.get("run");
  const research = runId ? await recruiterEngagementWeb.getResearchRun(runId) : undefined;
  const specialism = parameters.get("specialism");
  const showRemoved = parameters.get("showRemoved") === "on";
  return {
    registry: await recruiterEngagementWeb.getRecruiterRegistry({
      ...(showRemoved ? { includeRemoved: true } : {}),
      ...(specialism ? { specialism } : {}),
    }),
    registryFilters: { showRemoved, specialism: specialism ?? null },
    view: parameters.get("view") === "registry" ? ("registry" as const) : ("run" as const),
    research,
    criteriaOptions: recruiterEngagementWeb.getResearchCriteriaOptions(),
    defaultTargets: recruiterEngagementWeb.getDefaultSearchTargets(),
    providerSelection: recruiterEngagementWeb.providerSelectionApplies
      ? {
          providers: recruiterEngagementWeb.getPublicSearchProviderOptions(),
          selectedProvider: research
            ? recruiterEngagementWeb.getProviderNameForRun(research.run)
            : recruiterEngagementWeb.getPublicSearchSettings().providerName,
        }
      : undefined,
    initialLocationOptions: resolveLocations(research?.run.brief.criteria.targetLocations ?? []),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  return recruiterResearchAction(request);
}

export default function RecruiterResearchRoute() {
  const {
    criteriaOptions,
    defaultTargets,
    initialLocationOptions,
    providerSelection,
    registry,
    registryFilters,
    research,
    view,
  } = useLoaderData<typeof loader>();
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
      criteriaOptions={criteriaOptions}
      defaultTargets={defaultTargets}
      initialLocationOptions={initialLocationOptions}
      registry={registry}
      registryFilters={registryFilters}
      view={view}
      {...(providerSelection ? { providerSelection } : {})}
    />
  );
}
