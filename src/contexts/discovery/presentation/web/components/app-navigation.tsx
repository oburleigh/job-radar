import {
  BriefcaseBusiness,
  Database,
  History,
  Laptop,
  Moon,
  Radar,
  SlidersHorizontal,
  Sun,
  Waypoints,
} from "lucide-react";
import { useSyncExternalStore } from "react";
import { Link, useLocation } from "react-router";

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

const navigation = [
  {
    href: "/",
    label: "Opportunities",
    shortLabel: "Jobs",
    icon: BriefcaseBusiness,
  },
  {
    href: "/profiles",
    label: "Search profiles",
    shortLabel: "Profiles",
    icon: SlidersHorizontal,
  },
  {
    href: "/sources",
    label: "Source coverage",
    shortLabel: "Sources",
    icon: Waypoints,
  },
  { href: "/runs", label: "Discovery runs", shortLabel: "Runs", icon: History },
  {
    href: "/settings",
    label: "System settings",
    shortLabel: "Settings",
    icon: Database,
  },
] as const;

export function AppNavigation() {
  const { pathname } = useLocation();
  const theme = useSyncExternalStore(subscribeToTheme, getThemeSnapshot, getServerThemeSnapshot);

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
        {navigation.map((item, index) => {
          const Icon = item.icon;
          const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`nav-link${active ? " nav-link-active" : ""}`}
              aria-current={active ? "page" : undefined}
            >
              <span className="nav-index" aria-hidden="true">
                {String(index + 1).padStart(2, "0")}
              </span>
              <Icon className="nav-icon" size={17} aria-hidden="true" />
              <span className="nav-label">{item.label}</span>
              <span className="nav-label-short">{item.shortLabel}</span>
            </Link>
          );
        })}
      </nav>

      <div className="workspace-status">
        <span className="status-dot" aria-hidden="true" />
        <div>
          <strong>Local workspace</strong>
          <span>SQLite · private</span>
        </div>
      </div>

      <button
        className="theme-toggle"
        type="button"
        onClick={cycleTheme}
        aria-label={`Theme: ${theme}. Change theme`}
        title={`Theme: ${theme}. Click for the next mode.`}
      >
        <ThemeIcon size={16} aria-hidden="true" />
        <span>{theme}</span>
      </button>
    </header>
  );
}
