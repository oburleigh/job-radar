import { Outlet } from "react-router";

import { SettingsSectionNavigation } from "@/contexts/discovery/presentation/web/settings-section-navigation";

const sections = [
  { label: "Source Coverage", to: "/settings/adapters/source-coverage" },
  { label: "ATS Registry", to: "/settings/adapters/ats-registry" },
  { label: "LinkedIn", to: "/settings/adapters/linkedin" },
] as const;

export default function AdapterSettingsLayout() {
  return (
    <>
      <SettingsSectionNavigation label="Adapter settings" level="secondary" sections={sections} />
      <Outlet />
    </>
  );
}
