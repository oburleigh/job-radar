import { type ActionFunctionArgs, useLoaderData } from "react-router";

import { DirectoryMatchSettingsForm } from "@/contexts/recruiter-engagement/public-contract";
import {
  parseDirectoryMatchSettingsRequest,
  recruiterResearchSettingsContract,
} from "@/contexts/recruiter-engagement/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return { weights: recruiterResearchSettingsContract.getDirectoryMatchWeights() };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const parsed = parseDirectoryMatchSettingsRequest(await request.formData());
  if (!parsed.ok) return parsed;
  recruiterResearchSettingsContract.saveDirectoryMatchWeights(parsed.command);
  return { ok: true, message: "Directory ranking saved to SQLite." };
}

export default function RecruiterDirectoryRankingSettingsPage() {
  const { weights } = useLoaderData<typeof loader>();
  return (
    <DirectoryMatchSettingsForm
      action="/settings/recruiter-search/directory-ranking"
      weights={weights}
    />
  );
}
