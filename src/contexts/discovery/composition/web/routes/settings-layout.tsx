import { PageHeader } from "@job-radar/design-ui";
import { NavLink, Outlet, useNavigation } from "react-router";

const sections = [
  { label: "Opportunities", to: "/settings/opportunities" },
  { label: "Recruiter Search", to: "/settings/recruiter-search" },
  { label: "Adapters", to: "/settings/adapters" },
] as const;

export default function SettingsLayout() {
  const navigation = useNavigation();
  const pendingPathname = navigation.location?.pathname;
  return (
    <div className="page settings-page">
      <PageHeader
        title="Settings"
        description="Configure each feature and the adapters it can use. Changes are stored locally and apply to the next operation."
      />
      <nav className="settings-navigation" aria-label="Settings">
        {sections.map((section) => {
          const pending = matchesSection(section.to, pendingPathname);
          return (
            <NavLink
              aria-busy={pending || undefined}
              aria-current="location"
              className={({ isActive }) =>
                `settings-navigation-link${isActive ? " settings-navigation-link-active" : ""}${pending ? " settings-navigation-link-pending" : ""}`
              }
              key={section.to}
              to={section.to}
            >
              {section.label}
            </NavLink>
          );
        })}
      </nav>
      <Outlet />
    </div>
  );
}

function matchesSection(section: string, pathname: string | undefined): boolean {
  return pathname === section || pathname?.startsWith(`${section}/`) === true;
}
