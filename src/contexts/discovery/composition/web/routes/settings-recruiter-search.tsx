import { Outlet } from "react-router";

import { SettingsSectionNavigation } from "@/contexts/discovery/presentation/web/settings-section-navigation";

const sections = [
  { label: "Research criteria", to: "/settings/recruiter-search/research-criteria" },
  { label: "Public search", to: "/settings/recruiter-search/public-search" },
  { label: "Directory ranking", to: "/settings/recruiter-search/directory-ranking" },
  { label: "Research execution", to: "/settings/recruiter-search/execution" },
] as const;

export default function RecruiterSearchSettingsLayout() {
  return (
    <section className="settings-section" aria-labelledby="recruiter-search-settings-title">
      <div className="section-heading">
        <h2 id="recruiter-search-settings-title">Recruiter Search settings</h2>
      </div>
      <SettingsSectionNavigation
        label="Recruiter Search settings"
        level="secondary"
        sections={sections}
      />
      <div className="profile-editor">
        <Outlet />
      </div>
    </section>
  );
}
