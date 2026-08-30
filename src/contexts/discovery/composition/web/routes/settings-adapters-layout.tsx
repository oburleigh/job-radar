import { NavLink, Outlet, useNavigation } from "react-router";

export default function AdapterSettingsLayout() {
  const navigation = useNavigation();
  const pendingPathname = navigation.location?.pathname;
  return (
    <>
      <nav className="settings-subnavigation" aria-label="Adapter settings">
        <NavLink
          aria-busy={pendingPathname === "/settings/adapters/source-coverage" || undefined}
          className={() =>
            pendingPathname === "/settings/adapters/source-coverage"
              ? "settings-navigation-link-pending"
              : undefined
          }
          to="/settings/adapters/source-coverage"
        >
          Source Coverage
        </NavLink>
        <NavLink
          aria-busy={pendingPathname === "/settings/adapters/ats-registry" || undefined}
          className={() =>
            pendingPathname === "/settings/adapters/ats-registry"
              ? "settings-navigation-link-pending"
              : undefined
          }
          to="/settings/adapters/ats-registry"
        >
          ATS Registry
        </NavLink>
      </nav>
      <Outlet />
    </>
  );
}
