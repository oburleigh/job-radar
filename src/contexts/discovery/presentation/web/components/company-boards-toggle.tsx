import { Switch } from "@job-radar/design-ui";
import { useFetcher } from "react-router";

interface CompanyBoardsToggleProps {
  readonly enabled: boolean;
  readonly boardCount: number;
}

type ToggleResponse = {
  readonly ok: boolean;
  readonly message: string;
};

export function CompanyBoardsToggle({ enabled, boardCount }: CompanyBoardsToggleProps) {
  const fetcher = useFetcher<ToggleResponse>();
  const submittedValue = fetcher.formData?.get("enabled");
  const checked = submittedValue === "true" ? true : submittedValue === "false" ? false : enabled;
  const pending = fetcher.state !== "idle";

  return (
    <div className="company-boards-control">
      <div>
        <strong>Include company boards</strong>
        <span>
          Discovery connects to each enabled company board through its public ATS feed. This
          requires an internet connection and does not use the selected web search provider.
        </span>
      </div>
      <div className="company-boards-action">
        <Switch
          checked={checked}
          disabled={pending || boardCount === 0}
          label={`${checked ? "Disable" : "Enable"} all company boards`}
          onCheckedChange={(next) =>
            fetcher.submit(
              { intent: "toggle-company-boards", enabled: String(next) },
              { method: "post", action: "/settings/adapters/source-coverage" },
            )
          }
        />
        <span aria-live="polite" className="company-boards-status">
          {pending ? "Saving…" : fetcher.data && !fetcher.data.ok ? fetcher.data.message : ""}
        </span>
      </div>
    </div>
  );
}
