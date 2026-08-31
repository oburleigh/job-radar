import { TabNavigation } from "@job-radar/design-ui";
import { NavLink } from "react-router";

interface SettingsSection {
  readonly label: string;
  readonly to: string;
}

interface SettingsSectionNavigationProps {
  readonly label: string;
  readonly level?: "primary" | "secondary";
  readonly sections: readonly SettingsSection[];
}

export function SettingsSectionNavigation({
  label,
  level = "primary",
  sections,
}: SettingsSectionNavigationProps) {
  return (
    <TabNavigation label={label} level={level}>
      {sections.map((section) => (
        <NavLink key={section.to} to={section.to}>
          {section.label}
        </NavLink>
      ))}
    </TabNavigation>
  );
}
