import { type ActionFunctionArgs, useLoaderData } from "react-router";
import {
  DirectoryMatchSettingsForm,
  parseDirectoryMatchSettingsRequest,
  parseResearchExecutionSettingsRequest,
  ResearchExecutionSettingsForm,
} from "@/contexts/recruiter-engagement/public-contract";
import { recruiterResearchSettingsContract } from "@/contexts/recruiter-engagement/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return {
    execution: recruiterResearchSettingsContract.getExecutionSettings(),
    weights: recruiterResearchSettingsContract.getDirectoryMatchWeights(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "save-research-execution-settings") {
    const parsed = parseResearchExecutionSettingsRequest(formData);
    if (!parsed.ok) return parsed;
    recruiterResearchSettingsContract.saveExecutionSettings(parsed.command);
    return { ok: true, message: "Local Codex settings saved to SQLite." };
  }
  if (intent === "save-directory-match-weights") {
    const parsed = parseDirectoryMatchSettingsRequest(formData);
    if (!parsed.ok) return parsed;
    recruiterResearchSettingsContract.saveDirectoryMatchWeights(parsed.command);
    return { ok: true, message: "Directory ranking saved to SQLite." };
  }
  return { ok: false, message: "Unknown settings action." };
}

export default function RecruiterSearchSettingsPage() {
  const { execution, weights } = useLoaderData<typeof loader>();
  return (
    <section className="settings-section" aria-labelledby="recruiter-search-settings-title">
      <div className="section-heading">
        <h2 id="recruiter-search-settings-title">Recruiter Search settings</h2>
      </div>
      <div className="profile-editor">
        <ResearchExecutionSettingsForm action="/settings/recruiter-search" execution={execution} />
        <DirectoryMatchSettingsForm action="/settings/recruiter-search" weights={weights} />
      </div>
    </section>
  );
}
