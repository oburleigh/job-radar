import { IconButton } from "@job-radar/design-ui";
import { Bookmark, Check, Eye, EyeOff } from "lucide-react";
import { useOptimistic, useTransition } from "react";
import { useFetcher } from "react-router";

import type { JobListingState } from "@/contexts/discovery/domain/job-listing-state";

interface JobActionsProps {
  profileId: number;
  jobId: number;
  initialState: JobListingState;
}

export function JobActions({ profileId, jobId, initialState }: JobActionsProps) {
  const fetcher = useFetcher();
  const [state, setOptimisticState] = useOptimistic(initialState);
  const [isPending, startTransition] = useTransition();

  function update(nextState: JobListingState) {
    startTransition(async () => {
      setOptimisticState(nextState);
      await fetcher.submit(
        {
          intent: "update-job-state",
          profileId: String(profileId),
          jobId: String(jobId),
          status: nextState,
        },
        { method: "post", action: "/?index" },
      );
    });
  }

  return (
    <fieldset className="job-actions">
      <legend className="sr-only">Job status</legend>
      <IconButton
        pressed={state === "saved"}
        onClick={() => update(state === "saved" ? "new" : "saved")}
        disabled={isPending}
        label={state === "saved" ? "Remove saved status" : "Save job"}
        title={state === "saved" ? "Saved" : "Save"}
      >
        <Bookmark size={17} fill={state === "saved" ? "currentColor" : "none"} />
      </IconButton>
      <IconButton
        className={state === "applied" ? "applied" : undefined}
        pressed={state === "applied"}
        onClick={() => update(state === "applied" ? "new" : "applied")}
        disabled={isPending}
        label={state === "applied" ? "Remove applied status" : "Mark as applied"}
        title={state === "applied" ? "Applied" : "Mark applied"}
      >
        <Check size={18} />
      </IconButton>
      <IconButton
        pressed={state === "hidden"}
        onClick={() => update(state === "hidden" ? "new" : "hidden")}
        disabled={isPending}
        label={state === "hidden" ? "Restore job" : "Hide job"}
        title={state === "hidden" ? "Restore" : "Hide"}
      >
        {state === "hidden" ? <Eye size={17} /> : <EyeOff size={17} />}
      </IconButton>
    </fieldset>
  );
}
