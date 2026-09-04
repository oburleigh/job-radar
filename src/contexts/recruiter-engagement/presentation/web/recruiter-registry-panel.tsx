import { Button, SelectField } from "@job-radar/design-ui";
import { ExternalLink, RotateCcw, Trash2 } from "lucide-react";
import { useId } from "react";
import { Form } from "react-router";
import type {
  RecruiterRegistry,
  RegistryFirm,
  RegistryRecruiter,
} from "@/contexts/recruiter-engagement/domain/recruiter-registry";

export type RecruiterRegistryFilters = {
  readonly showRemoved: boolean;
  readonly specialism: string | null;
};

export function RecruiterRegistryPanel({
  filters,
  isSubmitting,
  registry,
}: {
  readonly filters: RecruiterRegistryFilters;
  readonly isSubmitting: boolean;
  readonly registry: RecruiterRegistry;
}) {
  const specialismFieldId = useId();
  const showRemovedId = useId();

  return (
    <section aria-labelledby="recruiter-registry-title" className="recruiter-registry">
      <div className="section-heading">
        <div>
          <h2 id="recruiter-registry-title">Registry</h2>
          <p>
            Every recruitment firm and recruiter kept across research runs. Removing a record here
            keeps it out of the registry even when a later run finds it again.
          </p>
        </div>
        <span>
          {registry.firmCount} firms · {registry.recruiterCount} recruiters shown ·{" "}
          {registry.removedCount} removed across the whole registry
        </span>
      </div>

      <Form className="recruiter-registry-filters" method="get" role="search">
        <input name="view" type="hidden" value="registry" />
        <SelectField
          id={specialismFieldId}
          label="Specialism"
          name="specialism"
          defaultValue={filters.specialism ?? ""}
        >
          <option value="">Every specialism</option>
          {registry.availableSpecialisms.map((specialism) => (
            <option key={specialism} value={specialism}>
              {specialism}
            </option>
          ))}
        </SelectField>
        <div className="recruiter-registry-toggle">
          <input
            defaultChecked={filters.showRemoved}
            id={showRemovedId}
            name="showRemoved"
            type="checkbox"
          />
          <label htmlFor={showRemovedId}>Show removed records</label>
        </div>
        <Button disabled={isSubmitting} type="submit" variant="secondary">
          Apply filters
        </Button>
      </Form>

      <div aria-live="polite" className="recruiter-registry-tiles">
        {registry.firms.length === 0 && registry.unassociatedRecruiters.length === 0 ? (
          <p className="recruiter-registry-empty">
            {filters.specialism
              ? `No firms in the registry hold the ${filters.specialism} specialism.`
              : "The registry is empty. Run a research search to fill it."}
          </p>
        ) : null}
        {registry.firms.map((firm) => (
          <FirmTile filters={filters} firm={firm} isSubmitting={isSubmitting} key={firm.id} />
        ))}
        {registry.unassociatedRecruiters.length > 0 ? (
          <article className="recruiter-registry-tile" data-removed={false}>
            <header>
              <h3>Recruiters without a firm</h3>
              <span>{registry.unassociatedRecruiters.length} recruiters</span>
            </header>
            <ul className="recruiter-registry-people">
              {registry.unassociatedRecruiters.map((recruiter) => (
                <RecruiterRow
                  filters={filters}
                  isSubmitting={isSubmitting}
                  key={recruiter.id}
                  recruiter={recruiter}
                />
              ))}
            </ul>
          </article>
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
  readonly filters: RecruiterRegistryFilters;
  readonly firm: RegistryFirm;
  readonly isSubmitting: boolean;
}) {
  return (
    <article className="recruiter-registry-tile" data-removed={firm.removed}>
      <header>
        <div>
          <h3>{firm.name}</h3>
          <p>
            {firm.specialisms.length > 0
              ? firm.specialisms.join(", ")
              : "No specialism evidence retained"}
          </p>
        </div>
        {firm.removed ? <span className="recruiter-registry-removed-label">Removed</span> : null}
      </header>
      <a href={firm.websiteUrl} rel="noreferrer" target="_blank">
        Firm website
      </a>
      <ul className="recruiter-registry-people">
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
          <li className="recruiter-registry-empty-people">No recruiters kept for this firm.</li>
        )}
      </ul>
      <div className="recruiter-registry-tile-actions">
        {firm.removed ? (
          <RestoreForm filters={filters} isSubmitting={isSubmitting} kind="firm" record={firm} />
        ) : (
          <details className="recruiter-registry-confirm">
            <summary>
              <Trash2 aria-hidden="true" size={15} />
              Remove firm
            </summary>
            <Form method="post">
              <FilterFields filters={filters} />
              <input name="intent" type="hidden" value="remove-directory-record" />
              <input name="kind" type="hidden" value="firm" />
              <input name="recordId" type="hidden" value={firm.id} />
              <fieldset>
                <legend>
                  Remove {firm.name}. What happens to its {firm.recruiters.length} recruiter
                  {firm.recruiters.length === 1 ? "" : "s"}?
                </legend>
                <label>
                  <input
                    defaultChecked
                    name="cascadeRecruiters"
                    type="radio"
                    value="with-recruiters"
                  />
                  Remove them with the firm
                </label>
                <label>
                  <input name="cascadeRecruiters" type="radio" value="firm-only" />
                  Keep them, without a firm
                </label>
              </fieldset>
              <Button disabled={isSubmitting} type="submit" variant="danger">
                Remove {firm.name}
              </Button>
            </Form>
          </details>
        )}
      </div>
    </article>
  );
}

function RecruiterRow({
  filters,
  isSubmitting,
  recruiter,
}: {
  readonly filters: RecruiterRegistryFilters;
  readonly isSubmitting: boolean;
  readonly recruiter: RegistryRecruiter;
}) {
  return (
    <li className="recruiter-registry-person" data-removed={recruiter.removed}>
      <div>
        <span className="recruiter-registry-person-name">{recruiter.name}</span>
        <span className="recruiter-registry-person-title">{recruiter.title}</span>
        {recruiter.removed ? (
          <span className="recruiter-registry-removed-label">Removed</span>
        ) : null}
      </div>
      <div className="recruiter-registry-person-actions">
        {recruiter.publicProfileUrl ? (
          <a href={recruiter.publicProfileUrl} rel="noreferrer" target="_blank">
            <ExternalLink aria-hidden="true" size={14} />
            Open {recruiter.name} on LinkedIn
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
  readonly filters: RecruiterRegistryFilters;
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

function FilterFields({ filters }: { readonly filters: RecruiterRegistryFilters }) {
  return (
    <>
      {filters.specialism ? (
        <input name="specialism" type="hidden" value={filters.specialism} />
      ) : null}
      {filters.showRemoved ? <input name="showRemoved" type="hidden" value="on" /> : null}
    </>
  );
}
