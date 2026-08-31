import { Button } from "@job-radar/design-ui";
import { Save } from "lucide-react";
import { useFetcher } from "react-router";
import type { DirectoryMatchWeights } from "@/contexts/recruiter-engagement/domain/recruiter-directory";

type SettingsActionState = { readonly message: string; readonly ok: boolean };

export function DirectoryMatchSettingsForm({
  action = "/settings/recruiter-search",
  weights,
}: {
  readonly action?: string;
  readonly weights: DirectoryMatchWeights;
}) {
  const fetcher = useFetcher<SettingsActionState>();
  const pending = fetcher.state !== "idle";
  return (
    <fetcher.Form action={action} className="profile-form" method="post">
      <input name="intent" type="hidden" value="save-directory-match-weights" />
      <section className="form-section">
        <div className="form-section-copy">
          <div>
            <h2>Directory ranking</h2>
            <p>Weight the evidence used to rank firms and recruiters. The values must total 100.</p>
          </div>
        </div>
        <div className="form-grid form-grid-three">
          <WeightField label="Specialism" name="specialism" value={weights.specialism} />
          <WeightField
            label="Target-market operating depth"
            name="targetMarketOperatingDepth"
            value={weights.targetMarketOperatingDepth}
          />
          <WeightField
            label="Current mandates or activity"
            name="currentMandatesOrActivity"
            value={weights.currentMandatesOrActivity}
          />
          <WeightField
            label="Named recruiter or team evidence"
            name="namedRecruiterOrTeamEvidence"
            value={weights.namedRecruiterOrTeamEvidence}
          />
          <WeightField
            label="Scale or track record"
            name="scaleOrTrackRecord"
            value={weights.scaleOrTrackRecord}
          />
          <WeightField
            label="Recruiter role and seniority"
            name="recruiterRoleAndSeniority"
            value={weights.recruiterRoleAndSeniority}
          />
          <WeightField
            label="Evidence freshness and quality"
            name="evidenceFreshnessAndQuality"
            value={weights.evidenceFreshnessAndQuality}
          />
        </div>
      </section>
      <div className="form-submit-row">
        {fetcher.data?.message ? (
          <p className={fetcher.data.ok ? "form-success" : "form-error"}>{fetcher.data.message}</p>
        ) : (
          <span />
        )}
        <Button busy={pending} disabled={pending} type="submit" variant="primary">
          <Save size={17} />
          {pending ? "Saving..." : "Save directory ranking"}
        </Button>
      </div>
    </fetcher.Form>
  );
}

function WeightField({
  label,
  name,
  value,
}: {
  readonly label: string;
  readonly name: keyof DirectoryMatchWeights;
  readonly value: number;
}) {
  return (
    <label>
      <span>{label}</span>
      <input defaultValue={value} max="100" min="0" name={name} required type="number" />
    </label>
  );
}
