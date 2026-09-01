import { type ActionFunctionArgs, useLoaderData } from "react-router";

import { ExecutionSettingsForm } from "@/contexts/recruiter-engagement/public-contract";
import {
  parseExecutionSettingsRequest,
  recruiterResearchSettingsContract,
} from "@/contexts/recruiter-engagement/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return { execution: recruiterResearchSettingsContract.getExecutionSettings() };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const parsed = parseExecutionSettingsRequest(await request.formData());
  if (!parsed.ok) return parsed;
  recruiterResearchSettingsContract.saveExecutionSettings(parsed.command);
  return { ok: true, message: "Research execution settings saved to SQLite." };
}

export default function RecruiterExecutionSettingsPage() {
  const { execution } = useLoaderData<typeof loader>();
  return (
    <ExecutionSettingsForm action="/settings/recruiter-search/execution" settings={execution} />
  );
}
