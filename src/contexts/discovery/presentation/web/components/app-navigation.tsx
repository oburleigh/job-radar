import { Button, NotificationBadge, Tooltip } from "@job-radar/design-ui";
import {
  BriefcaseBusiness,
  CircleUserRound,
  Cog,
  History,
  Laptop,
  Moon,
  Radar,
  SlidersHorizontal,
  Sun,
  UsersRound,
} from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Link, useLocation, useNavigation } from "react-router";

type ThemeMode = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "job-radar-theme";
const THEME_CHANGE_EVENT = "job-radar-theme-change";

function getThemeSnapshot(): ThemeMode {
  try {
    const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
  } catch {
    return "system";
  }
}

function getServerThemeSnapshot(): ThemeMode {
  return "system";
}

function subscribeToTheme(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(THEME_CHANGE_EVENT, onStoreChange);

  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(THEME_CHANGE_EVENT, onStoreChange);
  };
}

const primaryNavigation = [
  {
    href: "/",
    label: "Opportunities",
    shortLabel: "Jobs",
    icon: BriefcaseBusiness,
  },
  {
    href: "/recruiter-search",
    label: "Recruiter Search",
    shortLabel: "Recruiters",
    icon: UsersRound,
  },
] as const;

export function AppNavigation({ activeRunCount }: { readonly activeRunCount: number }) {
  const { pathname } = useLocation();
  const routeNavigation = useNavigation();
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement>(null);
  const profileMenuItemRef = useRef<HTMLAnchorElement>(null);
  const profileActive = matchesNavigationPath("/profiles", pathname);
  const pendingPathname =
    routeNavigation.state === "loading" ? routeNavigation.location?.pathname : undefined;
  const pendingDestination = primaryNavigation.find((item) =>
    pendingPathname ? matchesNavigationPath(item.href, pendingPathname) : false,
  );
  const settingsPending = pendingPathname
    ? matchesNavigationPath("/settings", pendingPathname)
    : false;
  const activityPending = pendingPathname
    ? matchesNavigationPath("/activity", pendingPathname)
    : false;
  const activityLabel =
    activeRunCount === 0
      ? "Activity"
      : `Activity, ${activeRunCount} active run${activeRunCount === 1 ? "" : "s"}`;
  const themeLabel = `Theme: ${theme}. Change theme`;

  function cycleTheme() {
    const next: ThemeMode = theme === "system" ? "light" : theme === "light" ? "dark" : "system";
    if (next === "system") {
      window.localStorage.removeItem(THEME_STORAGE_KEY);
      delete document.documentElement.dataset.theme;
    } else {
      window.localStorage.setItem(THEME_STORAGE_KEY, next);
      document.documentElement.dataset.theme = next;
    }
    window.dispatchEvent(new Event(THEME_CHANGE_EVENT));
  }

  const ThemeIcon = theme === "light" ? Sun : theme === "dark" ? Moon : Laptop;

  useEffect(() => {
    if (profileMenuOpen) {
      profileMenuItemRef.current?.focus();
    }
  }, [profileMenuOpen]);

  useEffect(() => {
    if (!profileMenuOpen) {
      return;
    }

    function dismissWhenClickedOutside(event: PointerEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    function dismissWhenFocusMovesOutside(event: FocusEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setProfileMenuOpen(false);
      }
    }

    window.addEventListener("pointerdown", dismissWhenClickedOutside);
    window.addEventListener("focusin", dismissWhenFocusMovesOutside);
    return () => {
      window.removeEventListener("pointerdown", dismissWhenClickedOutside);
      window.removeEventListener("focusin", dismissWhenFocusMovesOutside);
    };
  }, [profileMenuOpen]);

  return (
    <header className="masthead">
      <Link className="brand" to="/" aria-label="Job Radar opportunities">
        <span className="brand-mark" aria-hidden="true">
          <Radar size={21} strokeWidth={2.4} />
        </span>
        <span className="brand-copy">
          <span className="brand-name">Job Radar</span>
          <span className="brand-kicker">Private opportunity index</span>
        </span>
      </Link>

      <nav className="nav-list" aria-label="Primary navigation">
        {primaryNavigation.map((item) => {
          const Icon = item.icon;
          const active = matchesNavigationPath(item.href, pathname);
          const pending = pendingPathname
            ? matchesNavigationPath(item.href, pendingPathname)
            : false;
          return (
            <Link
              aria-busy={pending || undefined}
              key={item.href}
              to={item.href}
              className={`nav-link${active ? " nav-link-active" : ""}${pending ? " nav-link-pending" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="nav-icon" size={17} aria-hidden="true" />
              <span className="nav-label">{item.label}</span>
              <span className="nav-label-short">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>
      <span className="sr-only" role="status" aria-live="polite">
        {pendingDestination ? `Loading ${pendingDestination.label}.` : ""}
      </span>

      <div className="utility-controls">
        <div className="profile-menu" ref={profileMenuRef}>
          <Tooltip label="Search profiles">
            <Button
              aria-controls="search-profiles-menu"
              aria-current={profileActive ? "page" : undefined}
              aria-expanded={profileMenuOpen}
              aria-haspopup="menu"
              className={`utility-control${profileActive ? " utility-control-active" : ""}`}
              id="search-profiles-trigger"
              onClick={() => setProfileMenuOpen((open) => !open)}
            >
              <CircleUserRound size={19} aria-hidden="true" />
              <span className="sr-only">Search profiles</span>
            </Button>
          </Tooltip>
          {profileMenuOpen ? (
            <div className="profile-menu-content" id="search-profiles-menu" role="menu">
              <Link
                className="profile-menu-item"
                onClick={() => setProfileMenuOpen(false)}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setProfileMenuOpen(false);
                    document.getElementById("search-profiles-trigger")?.focus();
                  }
                }}
                ref={profileMenuItemRef}
                role="menuitem"
                to="/profiles"
              >
                <SlidersHorizontal size={17} aria-hidden="true" />
                Search profiles
              </Link>
            </div>
          ) : null}
        </div>
        <Tooltip label={activityLabel}>
          <Link
            aria-busy={activityPending || undefined}
            aria-current={matchesNavigationPath("/activity", pathname) ? "page" : undefined}
            className={`utility-link${matchesNavigationPath("/activity", pathname) ? " utility-control-active" : ""}${activityPending ? " utility-control-pending" : ""}`}
            to="/activity"
          >
            <History size={19} aria-hidden="true" />
            <NotificationBadge count={activeRunCount} />
          </Link>
        </Tooltip>
        <Tooltip label="System settings">
          <Link
            aria-busy={settingsPending || undefined}
            aria-current={matchesNavigationPath("/settings", pathname) ? "page" : undefined}
            className={`utility-link${matchesNavigationPath("/settings", pathname) ? " utility-control-active" : ""}${settingsPending ? " utility-control-pending" : ""}`}
            to="/settings/opportunities"
          >
            <Cog size={19} aria-hidden="true" />
          </Link>
        </Tooltip>
        <Tooltip label={themeLabel}>
          <Button className="theme-toggle utility-control" onClick={cycleTheme}>
            <ThemeIcon size={16} aria-hidden="true" />
            <span>{theme}</span>
          </Button>
        </Tooltip>
      </div>
    </header>
  );
}

function matchesNavigationPath(href: string, pathname: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}
