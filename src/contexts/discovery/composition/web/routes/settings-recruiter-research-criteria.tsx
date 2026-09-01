import { type ActionFunctionArgs, useLoaderData } from "react-router";

import { ResearchCriteriaOptionsForm } from "@/contexts/recruiter-engagement/public-contract";
import {
  parseResearchCriteriaOptionsRequest,
  recruiterResearchSettingsContract,
} from "@/contexts/recruiter-engagement/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return { criteriaOptions: recruiterResearchSettingsContract.getResearchCriteriaOptions() };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const parsed = parseResearchCriteriaOptionsRequest(await request.formData());
  if (!parsed.ok) return parsed;
  recruiterResearchSettingsContract.saveResearchCriteriaOptions(parsed.command);
  return { ok: true, message: "Research criteria saved to SQLite." };
}

export default function RecruiterResearchCriteriaSettingsPage() {
  const { criteriaOptions } = useLoaderData<typeof loader>();
  return (
    <ResearchCriteriaOptionsForm
      action="/settings/recruiter-search/research-criteria"
      options={criteriaOptions}
    />
  );
}
