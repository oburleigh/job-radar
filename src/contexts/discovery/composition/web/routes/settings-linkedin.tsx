import { type ActionFunctionArgs, useLoaderData } from "react-router";

import {
  LinkedInSettingsForm,
  parseLinkedInSettingsRequest,
} from "@/contexts/recruiter-engagement/public-contract";
import { recruiterAdapterSettingsContract } from "@/contexts/recruiter-engagement/public-contract.server";
import { assertLocalHost } from "@/platform/http/require-local-request";

export async function loader() {
  return {
    readiness: await recruiterAdapterSettingsContract.getLinkedInReadiness(),
    settings: recruiterAdapterSettingsContract.getLinkedInSettings(),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  assertLocalHost(request.headers.get("host") ?? "");
  const formData = await request.formData();
  if (formData.get("intent") !== "save-linkedin-settings") {
    return { ok: false, message: "Unknown settings action." };
  }
  const parsed = parseLinkedInSettingsRequest(formData);
  if (!parsed.ok) return parsed;
  recruiterAdapterSettingsContract.saveLinkedInSettings(parsed.command);
  return { ok: true, message: "LinkedIn adapter settings saved to SQLite." };
}

export default function LinkedInSettingsPage() {
  const { readiness, settings } = useLoaderData<typeof loader>();
  return (
    <section className="settings-section" aria-labelledby="linkedin-settings-title">
      <div className="section-heading">
        <h2 id="linkedin-settings-title">LinkedIn</h2>
      </div>
      <div className="profile-editor">
        <LinkedInSettingsForm readiness={readiness} settings={settings} />
      </div>
    </section>
  );
}
