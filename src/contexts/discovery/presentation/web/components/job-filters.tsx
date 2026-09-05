import { Button, IconButton } from "@job-radar/design-ui";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { type SyntheticEvent, useState, useTransition } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router";

interface JobFiltersProps {
  atsLabels: Record<string, string>;
  counts: {
    matched: number;
    new: number;
    saved: number;
    applied: number;
  };
}

export function JobFilters({ atsLabels, counts }: JobFiltersProps) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [current] = useSearchParams();
  const [query, setQuery] = useState(current.get("q") ?? "");
  const [isPending, startTransition] = useTransition();
  /*
   * Closed by default so a phone's first screen reaches a result rather than three blocks of
   * configuration. The narrow layout is the only one that honours this; at wider widths the
   * controls are always shown and the disclosure is not rendered at all.
   */
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilters = ["ats", "state", "q"].filter((key) => current.get(key)).length;

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
    const params = new URLSearchParams(current.toString());
    params.delete("ats");
    params.delete("state");
    params.delete("q");
    startTransition(() => {
      void navigate(`${pathname}?${params.toString()}`, { replace: true });
    });
  }

  return (
    <>
      <Button
        aria-controls="opportunity-filters"
        aria-expanded={filtersOpen}
        className="filter-disclosure"
        onClick={() => setFiltersOpen((open) => !open)}
        variant="quiet"
      >
        <SlidersHorizontal size={17} aria-hidden="true" />
        <span>{activeFilters > 0 ? `Filters (${activeFilters})` : "Filters"}</span>
      </Button>
      <section
        className={`filter-bar${isPending ? " filter-pending" : ""}`}
        aria-label="Filter opportunity catalogue"
        data-expanded={filtersOpen || undefined}
        id="opportunity-filters"
      >
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
            <option value="all">All active jobs ({counts.matched})</option>
            <option value="new">New ({counts.new})</option>
            <option value="saved">Saved ({counts.saved})</option>
            <option value="applied">Applied ({counts.applied})</option>
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
    </>
  );
}
