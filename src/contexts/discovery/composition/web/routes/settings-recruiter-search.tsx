import { type ActionFunctionArgs, useLoaderData } from "react-router";
import {
  DirectoryMatchSettingsForm,
  PublicSearchSettingsForm,
  parseDirectoryMatchSettingsRequest,
  parsePublicSearchSettingsRequest,
} from "@/contexts/recruiter-engagement/public-contract";
import { recruiterResearchSettingsContract } from "@/contexts/recruiter-engagement/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export function loader() {
  return {
    providers: recruiterResearchSettingsContract.getPublicSearchProviderOptions(),
    publicSearch: recruiterResearchSettingsContract.getPublicSearchSettings(),
    weights: recruiterResearchSettingsContract.getDirectoryMatchWeights(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "save-public-search-settings") {
    const parsed = parsePublicSearchSettingsRequest(formData);
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
  if (intent === "save-directory-match-weights") {
    const parsed = parseDirectoryMatchSettingsRequest(formData);
    if (!parsed.ok) return parsed;
    recruiterResearchSettingsContract.saveDirectoryMatchWeights(parsed.command);
    return { ok: true, message: "Directory ranking saved to SQLite." };
  }
  return { ok: false, message: "Unknown settings action." };
}

export default function RecruiterSearchSettingsPage() {
  const { providers, publicSearch, weights } = useLoaderData<typeof loader>();
  return (
    <section className="settings-section" aria-labelledby="recruiter-search-settings-title">
      <div className="section-heading">
        <h2 id="recruiter-search-settings-title">Recruiter Search settings</h2>
      </div>
      <div className="profile-editor">
        <PublicSearchSettingsForm
          action="/settings/recruiter-search"
          providers={providers}
          settings={publicSearch}
        />
        <DirectoryMatchSettingsForm action="/settings/recruiter-search" weights={weights} />
      </div>
    </section>
  );
}
