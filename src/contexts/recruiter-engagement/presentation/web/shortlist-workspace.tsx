import { Button, TextField } from "@job-radar/design-ui";
import { Form } from "react-router";
import type {
  ShortlistProspectResult,
  ShortlistResult,
} from "@/contexts/recruiter-engagement/application/shortlists/manage-shortlists";
import type { RankedRecruiter } from "@/contexts/recruiter-engagement/domain/recruiter-directory";
import { RecruiterEvidenceHistory } from "./recruiter-evidence-history";

export function ShortlistWorkspace({
  isSubmitting,
  runId,
  shortlists,
}: {
  readonly isSubmitting: boolean;
  readonly runId: string;
  readonly shortlists: readonly ShortlistResult[];
}) {
  return (
    <section className="recruiter-shortlists" aria-labelledby="recruiter-shortlists-title">
      <div className="recruiter-shortlists-heading">
        <div>
          <h3 id="recruiter-shortlists-title">Shortlists</h3>
          <p>Build trusted working lists before any Campaign is prepared.</p>
        </div>
        <Form className="recruiter-shortlist-create" method="post">
          <input name="intent" type="hidden" value="create-shortlist" />
          <input name="runId" type="hidden" value={runId} />
          <TextField
            disabled={isSubmitting}
            id={`shortlist-name-${runId}`}
            label="Shortlist name"
            name="name"
            required
          />
          <Button busy={isSubmitting} disabled={isSubmitting} type="submit" variant="primary">
            Create Shortlist
          </Button>
        </Form>
      </div>
      {shortlists.length === 0 ? (
        <p className="recruiter-shortlist-empty">
          Create a named Shortlist, then add canonical Recruiters from the Directory.
        </p>
      ) : (
        <div className="recruiter-shortlist-grid">
          {shortlists.map((shortlist) => (
            <article className="recruiter-shortlist-card" key={shortlist.id}>
              <header>
                <div>
                  <span className="recruiter-record-label">
                    {shortlist.prospects.length} Prospect
                    {shortlist.prospects.length === 1 ? "" : "s"}
                  </span>
                  <h4>{shortlist.name}</h4>
                </div>
                <Form method="post">
                  <input name="intent" type="hidden" value="delete-shortlist" />
                  <input name="runId" type="hidden" value={runId} />
                  <input name="shortlistId" type="hidden" value={shortlist.id} />
                  <Button
                    busy={isSubmitting}
                    disabled={isSubmitting}
                    type="submit"
                    variant="danger"
                  >
                    Delete Shortlist
                  </Button>
                </Form>
              </header>
              {shortlist.prospects.length === 0 ? (
                <p className="recruiter-shortlist-empty">No Prospect has been added yet.</p>
              ) : (
                <ul className="recruiter-shortlist-prospects">
                  {shortlist.prospects.map((prospect) => (
                    <ShortlistProspect
                      isSubmitting={isSubmitting}
                      key={prospect.recruiterId}
                      prospect={prospect}
                      runId={runId}
                      shortlistId={shortlist.id}
                    />
                  ))}
                </ul>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ShortlistProspect({
  isSubmitting,
  prospect,
  runId,
  shortlistId,
}: {
  readonly isSubmitting: boolean;
  readonly prospect: ShortlistProspectResult;
  readonly runId: string;
  readonly shortlistId: string;
}) {
  return (
    <li>
      <div className="recruiter-shortlist-prospect-heading">
        <div>
          <strong>{prospect.recruiter.name}</strong>
          <span>
            {prospect.recruiter.title}
            {prospect.firm ? ` · ${prospect.firm.name}` : " · Firm unresolved"}
          </span>
        </div>
        <span
          className="recruiter-campaign-eligibility"
          data-eligible={prospect.campaignPreparation.eligible}
        >
          {prospect.campaignPreparation.eligible
            ? "Eligible for Campaign preparation"
            : "Ineligible for Campaign preparation"}
        </span>
      </div>
      <div className="recruiter-shortlist-facts">
        <span>Contact exclusion: {contactExclusionLabel(prospect.contactExclusion)}</span>
        <span>Prior engagement: None recorded</span>
      </div>
      <RecruiterEvidenceHistory evidence={prospect.evidence} />
      {prospect.contactRoutes.length > 0 ? (
        <div className="recruiter-shortlist-routes">
          {prospect.contactRoutes.map((route) => (
            <div key={`${route.kind}:${route.value}`}>
              <strong>Work email: {route.value}</strong>
              {route.evidence.map((evidence) => (
                <small key={`${evidence.sourceUrl}:${evidence.observedAt}`}>
                  <a href={evidence.sourceUrl} rel="noreferrer" target="_blank">
                    Public Contact route Evidence
                  </a>{" "}
                  · Observed {evidence.observedAt} · {evidence.confidence} confidence
                </small>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <p className="recruiter-shortlist-route-missing">
          No current publicly evidenced work Contact route is available.
        </p>
      )}
      {prospect.contactExclusion !== "none" && prospect.campaignPreparation.reasons.length > 0 ? (
        <p className="recruiter-shortlist-exclusion-reason">
          {prospect.campaignPreparation.reasons.join(" ")}
        </p>
      ) : null}
      <div className="recruiter-shortlist-actions">
        <ContactExclusionForm
          busy={isSubmitting}
          contactExclusion="none"
          disabled={isSubmitting || prospect.contactExclusion === "none"}
          label="Clear exclusion"
          prospect={prospect}
          runId={runId}
          shortlistId={shortlistId}
        />
        <ContactExclusionForm
          busy={isSubmitting}
          contactExclusion="suppressed"
          disabled={isSubmitting || prospect.contactExclusion === "suppressed"}
          label="Suppress"
          prospect={prospect}
          runId={runId}
          shortlistId={shortlistId}
        />
        <ContactExclusionForm
          busy={isSubmitting}
          contactExclusion="do-not-contact"
          disabled={isSubmitting || prospect.contactExclusion === "do-not-contact"}
          label="Do Not Contact"
          prospect={prospect}
          runId={runId}
          shortlistId={shortlistId}
        />
        <Form method="post">
          <input name="intent" type="hidden" value="remove-prospect" />
          <input name="runId" type="hidden" value={runId} />
          <input name="shortlistId" type="hidden" value={shortlistId} />
          <input name="recruiterId" type="hidden" value={prospect.recruiterId} />
          <Button busy={isSubmitting} disabled={isSubmitting} type="submit" variant="danger">
            Remove Prospect
          </Button>
        </Form>
      </div>
    </li>
  );
}

function ContactExclusionForm({
  busy,
  contactExclusion,
  disabled,
  label,
  prospect,
  runId,
  shortlistId,
}: {
  readonly busy: boolean;
  readonly contactExclusion: ShortlistProspectResult["contactExclusion"];
  readonly disabled: boolean;
  readonly label: string;
  readonly prospect: ShortlistProspectResult;
  readonly runId: string;
  readonly shortlistId: string;
}) {
  return (
    <Form method="post">
      <input name="intent" type="hidden" value="set-contact-exclusion" />
      <input name="runId" type="hidden" value={runId} />
      <input name="shortlistId" type="hidden" value={shortlistId} />
      <input name="recruiterId" type="hidden" value={prospect.recruiterId} />
      <input name="contactExclusion" type="hidden" value={contactExclusion} />
      <Button busy={busy} disabled={disabled} type="submit">
        {label}
      </Button>
    </Form>
  );
}

export function AddToShortlist({
  isSubmitting,
  recruiter,
  runId,
  shortlists,
}: {
  readonly isSubmitting: boolean;
  readonly recruiter: RankedRecruiter;
  readonly runId: string;
  readonly shortlists: readonly ShortlistResult[];
}) {
  const available = shortlists.filter(
    (shortlist) => !shortlist.prospects.some((prospect) => prospect.recruiterId === recruiter.id),
  );
  if (shortlists.length === 0) {
    return <small>Create a Shortlist to add this Recruiter.</small>;
  }
  if (available.length === 0) {
    return <small>Already in every Shortlist.</small>;
  }
  return (
    <Form className="recruiter-add-to-shortlist" method="post">
      <input name="intent" type="hidden" value="add-prospect" />
      <input name="runId" type="hidden" value={runId} />
      <input name="recruiterId" type="hidden" value={recruiter.id} />
      <label>
        <span>Add to Shortlist</span>
        <select disabled={isSubmitting} name="shortlistId">
          {available.map((shortlist) => (
            <option key={shortlist.id} value={shortlist.id}>
              {shortlist.name}
            </option>
          ))}
        </select>
      </label>
      <Button busy={isSubmitting} disabled={isSubmitting} type="submit">
        Add Prospect
      </Button>
    </Form>
  );
}

function contactExclusionLabel(
  contactExclusion: ShortlistProspectResult["contactExclusion"],
): string {
  if (contactExclusion === "suppressed") {
    return "Suppressed";
  }
  if (contactExclusion === "do-not-contact") {
    return "Do Not Contact";
  }
  return "None";
}
