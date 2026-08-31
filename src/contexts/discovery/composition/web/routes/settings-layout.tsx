import { PageHeader } from "@job-radar/design-ui";
import { Outlet } from "react-router";

import { SettingsSectionNavigation } from "@/contexts/discovery/presentation/web/settings-section-navigation";

const sections = [
  { label: "Opportunities", to: "/settings/opportunities" },
  { label: "Recruiter Search", to: "/settings/recruiter-search" },
  { label: "Adapters", to: "/settings/adapters" },
] as const;

export default function SettingsLayout() {
  return (
    <div className="page settings-page">
      <PageHeader
        title="Settings"
        description="Configure each feature and the adapters it can use. Changes are stored locally and apply to the next operation."
      />
      <SettingsSectionNavigation label="Settings" sections={sections} />
      <Outlet />
    </div>
  );
}
