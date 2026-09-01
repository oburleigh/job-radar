import { Switch } from "@job-radar/design-ui";
import { useFetcher } from "react-router";

interface CompanyBoardRefreshToggleProps {
  readonly enabled: boolean;
}

type ToggleResponse = {
  readonly ok: boolean;
  readonly message: string;
};

export function CompanyBoardRefreshToggle({ enabled }: CompanyBoardRefreshToggleProps) {
  const fetcher = useFetcher<ToggleResponse>();
  const submittedValue = fetcher.formData?.get("enabled");
  const checked = submittedValue === "true" ? true : submittedValue === "false" ? false : enabled;
  const pending = fetcher.state !== "idle";

  return (
    <div className="company-board-refresh-control">
      <div>
        <strong>Refresh company boards</strong>
        <span>
          Master control for discovery. Individual company-board choices are preserved when this is
          off.
        </span>
      </div>
      <div className="company-board-refresh-action">
        <Switch
          checked={checked}
          disabled={pending}
          label={`${checked ? "Disable" : "Enable"} all registered boards for discovery`}
          onCheckedChange={(next) =>
            fetcher.submit(
              { intent: "toggle-company-board-refresh", enabled: String(next) },
              { method: "post", action: "/settings/adapters/source-coverage" },
            )
          }
        />
        <span aria-live="polite" className="company-board-refresh-status">
          {pending ? "Saving…" : fetcher.data && !fetcher.data.ok ? fetcher.data.message : ""}
        </span>
      </div>
    </div>
  );
}
