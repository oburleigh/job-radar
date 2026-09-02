import { type ActionFunctionArgs, useLoaderData } from "react-router";

import { PublicSearchSettingsForm } from "@/contexts/recruiter-engagement/public-contract";
import {
  parsePublicSearchSettingsRequest,
  recruiterResearchSettingsContract,
} from "@/contexts/recruiter-engagement/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return {
    governsRuns: recruiterResearchSettingsContract.publicSearchSettingsGovernRuns,
    providers: recruiterResearchSettingsContract.getPublicSearchProviderOptions(),
    publicSearch: recruiterResearchSettingsContract.getPublicSearchSettings(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const parsed = parsePublicSearchSettingsRequest(await request.formData());
  if (!parsed.ok) return parsed;
  const provider = recruiterResearchSettingsContract
    .getPublicSearchProviderOptions()
    .find((option) => option.name === parsed.command.providerName && option.configured);
  if (!provider) {
    return {
      field: "providerName" as const,
      ok: false,
      message: "Choose a configured search provider.",
    };
  }
  recruiterResearchSettingsContract.savePublicSearchSettings(parsed.command);
  return { ok: true, message: "Public search settings saved to SQLite." };
}

export default function RecruiterPublicSearchSettingsPage() {
  const { governsRuns, providers, publicSearch } = useLoaderData<typeof loader>();
  return (
    <PublicSearchSettingsForm
      action="/settings/recruiter-search/public-search"
      governsRuns={governsRuns}
      providers={providers}
      settings={publicSearch}
    />
  );
}
