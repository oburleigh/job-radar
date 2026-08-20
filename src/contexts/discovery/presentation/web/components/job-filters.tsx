import { IconButton } from "@job-radar/design-ui";
import { Search, X } from "lucide-react";
import { type SyntheticEvent, useState, useTransition } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

interface ProfileOption {
  id: number;
  name: string;
}

interface JobFiltersProps {
  profiles: ProfileOption[];
  currentProfileId: number;
  atsLabels: Record<string, string>;
}

export function JobFilters({ profiles, currentProfileId, atsLabels }: JobFiltersProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [current] = useSearchParams();
  const [query, setQuery] = useState(current.get("q") ?? "");
  const [isPending, startTransition] = useTransition();

  function update(key: string, value: string) {
    const params = new URLSearchParams(current.toString());
    if (value && value !== "all") {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    startTransition(() => {
      void navigate(`${pathname}?${params.toString()}`, { replace: true });
    });
  }

  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    update("q", query.trim());
  }

  function reset() {
    setQuery("");
    startTransition(() => void navigate(pathname, { replace: true }));
  }

  return (
    <section
      className={`filter-bar${isPending ? " filter-pending" : ""}`}
      aria-label="Filter opportunity catalogue"
    >
      <div className="filter-index" aria-hidden="true">
        <strong>03</strong>
        <span>Filter index</span>
      </div>
      <label className="filter-field profile-filter">
        <span>Profile</span>
        <select
          value={String(currentProfileId)}
          onChange={(event) => update("profile", event.target.value)}
        >
          {profiles.map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Source</span>
        <select
          value={current.get("ats") ?? "all"}
          onChange={(event) => update("ats", event.target.value)}
        >
          <option value="all">All ATS sources</option>
          {Object.entries(atsLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <label className="filter-field">
        <span>Status</span>
        <select
          value={current.get("state") ?? "all"}
          onChange={(event) => update("state", event.target.value)}
        >
          <option value="all">All active jobs</option>
          <option value="new">New</option>
          <option value="saved">Saved</option>
          <option value="applied">Applied</option>
          <option value="hidden">Hidden</option>
        </select>
      </label>

      <form className="search-field" onSubmit={submit}>
        <span>Search matches</span>
        <div>
          <Search size={16} aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Title, company, location"
            aria-label="Search matched jobs"
          />
        </div>
      </form>

      <IconButton className="filter-reset" onClick={reset} label="Clear filters">
        <X size={17} />
      </IconButton>
    </section>
  );
}
