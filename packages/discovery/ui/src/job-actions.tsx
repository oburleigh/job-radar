import { Bookmark, Check, Eye, EyeOff } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { useFetcher } from "react-router";

import type { JobListingStateView } from "./contracts.js";

interface JobActionsProps {
  profileId: number;
  jobId: number;
  initialState: JobListingStateView;
}

export function JobActions({ profileId, jobId, initialState }: JobActionsProps) {
  const fetcher = useFetcher();
  const [state, setOptimisticState] = useOptimistic(initialState);
  const [isPending, startTransition] = useTransition();

  function update(nextState: JobListingStateView) {
    startTransition(async () => {
      setOptimisticState(nextState);
      await fetcher.submit(
        {
          intent: "update-job-state",
          profileId: String(profileId),
          jobId: String(jobId),
          status: nextState,
        },
        { method: "post", action: "/" },
      );
    });
  }

  return (
    <fieldset className="job-actions">
      <legend className="sr-only">Job status</legend>
      <button
        type="button"
        className={state === "saved" ? "active" : ""}
        onClick={() => update(state === "saved" ? "new" : "saved")}
        disabled={isPending}
        aria-label={state === "saved" ? "Remove saved status" : "Save job"}
        title={state === "saved" ? "Saved" : "Save"}
      >
        <Bookmark size={17} fill={state === "saved" ? "currentColor" : "none"} />
      </button>
      <button
        type="button"
        className={state === "applied" ? "active applied" : ""}
        onClick={() => update(state === "applied" ? "new" : "applied")}
        disabled={isPending}
        aria-label={state === "applied" ? "Remove applied status" : "Mark as applied"}
        title={state === "applied" ? "Applied" : "Mark applied"}
      >
        <Check size={18} />
      </button>
      <button
        type="button"
        onClick={() => update(state === "hidden" ? "new" : "hidden")}
        disabled={isPending}
        aria-label={state === "hidden" ? "Restore job" : "Hide job"}
        title={state === "hidden" ? "Restore" : "Hide"}
      >
        {state === "hidden" ? <Eye size={17} /> : <EyeOff size={17} />}
      </button>
    </fieldset>
  );
}
