import {
  Button,
  buttonAttributes,
  Card,
  Checkbox,
  controlRowAttributes,
  IconButton,
  Modal,
  RadioGroup,
  SelectField,
} from "@job-radar/design-ui";
import { ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { useId, useState } from "react";
import { Form } from "react-router";
import type {
  DirectoryFirm,
  DirectoryRecruiter,
  RecruiterDirectoryListing,
} from "@/contexts/recruiter-engagement/domain/recruiter-directory-listing";

export type RecruiterDirectoryFilters = {
  readonly showRemoved: boolean;
  readonly specialism: string | null;
  readonly targetMarket: string | null;
};

export function RecruiterDirectoryPanel({
  filters,
  isSubmitting,
  listing,
}: {
  readonly filters: RecruiterDirectoryFilters;
  readonly isSubmitting: boolean;
  readonly listing: RecruiterDirectoryListing;
}) {
  const specialismFieldId = useId();
  const targetMarketFieldId = useId();
  const showRemovedId = useId();

  return (
    <section aria-labelledby="recruiter-directory-title" className="recruiter-directory">
      {/* The tab above is the visible label, so repeating it here would name the page twice. */}
      <h2 className="sr-only" id="recruiter-directory-title">
        Directory
      </h2>
      <div className="recruiter-directory-intro">
        <p>
          Every firm and recruiter kept across research runs. A removal here survives later runs.
        </p>
        {/* Two scopes, so two sentences. One run of numbers would read as a single scope. */}
        <p className="recruiter-directory-counts">
          <span>
            Showing {listing.firmCount} {listing.firmCount === 1 ? "firm" : "firms"} and{" "}
            {listing.recruiterCount} {listing.recruiterCount === 1 ? "recruiter" : "recruiters"}.
          </span>
          {listing.removedCount > 0 ? (
            <span>
              {listing.removedCount} {listing.removedCount === 1 ? "record" : "records"} removed
              from the whole Directory.
            </span>
          ) : null}
        </p>
      </div>

      <Form {...controlRowAttributes(2, "recruiter-directory-filters")} method="get" role="search">
        <input name="view" type="hidden" value="directory" />
        <SelectField
          defaultValue={filters.specialism ?? ""}
          id={specialismFieldId}
          label="Specialism"
          name="specialism"
        >
          <option value="">Every specialism</option>
          {listing.availableSpecialisms.map((specialism) => (
            <option key={specialism} value={specialism}>
              {specialism}
            </option>
          ))}
        </SelectField>
        <SelectField
          defaultValue={filters.targetMarket ?? ""}
          id={targetMarketFieldId}
          label="Target market"
          name="targetMarket"
        >
          <option value="">Every target market</option>
          {listing.availableTargetMarkets.map((targetMarket) => (
            <option key={targetMarket} value={targetMarket}>
              {targetMarket}
            </option>
          ))}
        </SelectField>
        <div className="recruiter-directory-filter-actions">
          <Checkbox
            defaultChecked={filters.showRemoved}
            id={showRemovedId}
            label="Show removed records"
            name="showRemoved"
          />
          <Button disabled={isSubmitting} type="submit" variant="secondary">
            Apply filters
          </Button>
        </div>
      </Form>

      <div aria-live="polite" className="recruiter-directory-tiles">
        {listing.firms.length === 0 && listing.unassociatedRecruiters.length === 0 ? (
          <p className="recruiter-directory-empty">{emptyDirectoryMessage(filters)}</p>
        ) : null}
        {listing.firms.map((firm) => (
          <FirmTile filters={filters} firm={firm} isSubmitting={isSubmitting} key={firm.id} />
        ))}
        {listing.unassociatedRecruiters.length > 0 ? (
          <Card className="recruiter-directory-tile">
            <header>
              <h3>Recruiters without a firm</h3>
              <span>
                {listing.unassociatedRecruiters.length}{" "}
                {listing.unassociatedRecruiters.length === 1 ? "recruiter" : "recruiters"}
              </span>
            </header>
            <ul className="recruiter-directory-people">
              {listing.unassociatedRecruiters.map((recruiter) => (
                <RecruiterRow
                  filters={filters}
                  isSubmitting={isSubmitting}
                  key={recruiter.id}
                  recruiter={recruiter}
                />
              ))}
            </ul>
          </Card>
        ) : null}
      </div>
    </section>
  );
}

function FirmTile({
  filters,
  firm,
  isSubmitting,
}: {
  readonly filters: RecruiterDirectoryFilters;
  readonly firm: DirectoryFirm;
  readonly isSubmitting: boolean;
}) {
  // The shared control is deliberate about state, so the choice is held rather than left to the DOM.
  const [cascade, setCascade] = useState("with-recruiters");
  const [confirming, setConfirming] = useState(false);

  return (
    <Card className="recruiter-directory-tile" tone={firm.removed ? "retired" : undefined}>
      <header>
        <div>
          <h3>{firm.name}</h3>
          <p>
            {firm.specialisms.length > 0
              ? firm.specialisms.join(", ")
              : "No specialism evidence retained"}
          </p>
        </div>
        {firm.removed ? <span className="recruiter-directory-removed-label">Removed</span> : null}
        {firm.removed ? null : (
          <IconButton
            className="recruiter-directory-remove"
            label={`Remove ${firm.name}`}
            onClick={() => setConfirming(true)}
          >
            <Trash2 aria-hidden="true" size={15} />
          </IconButton>
        )}
      </header>
      <Modal
        onClose={() => setConfirming(false)}
        open={confirming}
        title={`Remove ${firm.name}`}
        actions={
          <Form method="post">
            <FilterFields filters={filters} />
            <input name="intent" type="hidden" value="remove-directory-record" />
            <input name="kind" type="hidden" value="firm" />
            <input name="recordId" type="hidden" value={firm.id} />
            <input name="cascadeRecruiters" type="hidden" value={cascade} />
            <Button disabled={isSubmitting} type="submit" variant="danger">
              Remove {firm.name}
            </Button>
          </Form>
        }
      >
        {firm.recruiters.length === 0 ? (
          <p>This firm has no recruiters kept, so only the firm is removed.</p>
        ) : (
          <RadioGroup
            id={`cascade-recruiters-${firm.id}`}
            legend={
              <>
                What happens to its {firm.recruiters.length} recruiter
                {firm.recruiters.length === 1 ? "" : "s"}?
              </>
            }
            name="cascadeRecruiters"
            onChange={setCascade}
            options={[
              { label: "Remove them with the firm", value: "with-recruiters" },
              { label: "Keep them, without a firm", value: "firm-only" },
            ]}
            value={cascade}
          />
        )}
      </Modal>
      {firm.targetMarkets.length > 0 ? (
        <ul aria-label={`Target markets for ${firm.name}`} className="recruiter-directory-markets">
          {firm.targetMarkets.map((targetMarket) => (
            <li className="recruiter-tag" key={targetMarket}>
              {targetMarket}
            </li>
          ))}
        </ul>
      ) : (
        <p className="recruiter-directory-no-market">No Target market Evidence retained</p>
      )}
      <div className="recruiter-directory-external-actions">
        <a
          href={firm.websiteUrl}
          rel="noreferrer"
          target="_blank"
          {...buttonAttributes("secondary")}
        >
          <ExternalLink aria-hidden="true" size={14} />
          Open {firm.name} website
        </a>
      </div>
      <ul className="recruiter-directory-people">
        {firm.recruiters.length > 0 ? (
          firm.recruiters.map((recruiter) => (
            <RecruiterRow
              filters={filters}
              isSubmitting={isSubmitting}
              key={recruiter.id}
              recruiter={recruiter}
            />
          ))
        ) : (
          <li className="recruiter-directory-empty-people">No recruiters kept for this firm.</li>
        )}
      </ul>
      <div className="recruiter-directory-tile-actions">
        {firm.removed ? (
          <RestoreForm filters={filters} isSubmitting={isSubmitting} kind="firm" record={firm} />
        ) : null}
      </div>
    </Card>
  );
}

function RecruiterRow({
  filters,
  isSubmitting,
  recruiter,
}: {
  readonly filters: RecruiterDirectoryFilters;
  readonly isSubmitting: boolean;
  readonly recruiter: DirectoryRecruiter;
}) {
  return (
    <li className="recruiter-directory-person" data-removed={recruiter.removed}>
      <div>
        <span className="recruiter-directory-person-name">{recruiter.name}</span>
        <span className="recruiter-directory-person-title">{recruiter.title}</span>
        {recruiter.removed ? (
          <span className="recruiter-directory-removed-label">Removed</span>
        ) : null}
      </div>
      <div className="recruiter-directory-person-actions">
        {recruiter.publicProfileUrl ? (
          <a
            href={recruiter.publicProfileUrl}
            rel="noreferrer"
            target="_blank"
            {...buttonAttributes("secondary")}
          >
            <ExternalLink aria-hidden="true" size={14} />
            Open {recruiter.name} public profile
          </a>
        ) : null}
        {recruiter.removed ? (
          <RestoreForm
            filters={filters}
            isSubmitting={isSubmitting}
            kind="recruiter"
            record={recruiter}
          />
        ) : (
          <Form method="post">
            <FilterFields filters={filters} />
            <input name="intent" type="hidden" value="remove-directory-record" />
            <input name="kind" type="hidden" value="recruiter" />
            <input name="recordId" type="hidden" value={recruiter.id} />
            <Button disabled={isSubmitting} type="submit" variant="secondary">
              <Trash2 aria-hidden="true" size={14} />
              Remove {recruiter.name}
            </Button>
          </Form>
        )}
      </div>
    </li>
  );
}

function RestoreForm({
  filters,
  isSubmitting,
  kind,
  record,
}: {
  readonly filters: RecruiterDirectoryFilters;
  readonly isSubmitting: boolean;
  readonly kind: "firm" | "recruiter";
  readonly record: { readonly id: string; readonly name: string };
}) {
  return (
    <Form method="post">
      <FilterFields filters={filters} />
      <input name="intent" type="hidden" value="restore-directory-record" />
      <input name="kind" type="hidden" value={kind} />
      <input name="recordId" type="hidden" value={record.id} />
      <Button disabled={isSubmitting} type="submit" variant="secondary">
        <RotateCcw aria-hidden="true" size={14} />
        Restore {record.name}
      </Button>
    </Form>
  );
}

function FilterFields({ filters }: { readonly filters: RecruiterDirectoryFilters }) {
  return (
    <>
      {filters.specialism ? (
        <input name="specialism" type="hidden" value={filters.specialism} />
      ) : null}
      {filters.targetMarket ? (
        <input name="targetMarket" type="hidden" value={filters.targetMarket} />
      ) : null}
      {filters.showRemoved ? <input name="showRemoved" type="hidden" value="on" /> : null}
    </>
  );
}

function emptyDirectoryMessage(filters: RecruiterDirectoryFilters): string {
  if (filters.specialism && filters.targetMarket) {
    return `No firms in the Directory hold the ${filters.specialism} specialism in the ${filters.targetMarket} Target market.`;
  }
  if (filters.specialism) {
    return `No firms in the Directory hold the ${filters.specialism} specialism.`;
  }
  if (filters.targetMarket) {
    return `No firms in the Directory hold the ${filters.targetMarket} Target market.`;
  }
  return "The Directory is empty. Run a research search to fill it.";
}
