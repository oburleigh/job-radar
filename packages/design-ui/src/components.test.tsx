import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Button,
  buttonAttributes,
  Card,
  ControlRow,
  controlRowAttributes,
  IconButton,
  Modal,
  NotificationBadge,
  PageHeader,
  Panel,
  SectionHeader,
  SelectField,
  Skeleton,
  Switch,
  TabNavigation,
  TextField,
} from "./index";

describe("generic UI public contract", () => {
  it("gives every page-level box one shape, whichever element carries it", () => {
    const div = renderToStaticMarkup(<Panel>Body</Panel>);
    const section = renderToStaticMarkup(<Panel as="section">Body</Panel>);

    expect(div).toBe('<div class="jr-panel">Body</div>');
    expect(section).toBe('<section class="jr-panel">Body</section>');
  });

  it("states a panel's overflow only where the product has asked for one", () => {
    expect(renderToStaticMarkup(<Panel>Body</Panel>)).not.toContain("data-overflow");
    expect(renderToStaticMarkup(<Panel overflow="clipped">Body</Panel>)).toContain(
      'data-overflow="clipped"',
    );
    expect(renderToStaticMarkup(<Panel overflow="visible">Body</Panel>)).toContain(
      'data-overflow="visible"',
    );
  });

  it("keeps a caller's layout class beside the panel's own", () => {
    const html = renderToStaticMarkup(<Panel className="run-panel">Body</Panel>);

    expect(html).toContain('class="jr-panel run-panel"');
  });

  it("separates a card's tone and inset from its box", () => {
    expect(renderToStaticMarkup(<Card>Row</Card>)).toBe('<article class="jr-card">Row</article>');
    expect(renderToStaticMarkup(<Card tone="retired">Row</Card>)).toContain('data-tone="retired"');
    expect(renderToStaticMarkup(<Card tone="outlined">Row</Card>)).toContain(
      'data-tone="outlined"',
    );
    expect(renderToStaticMarkup(<Card padding="none">Row</Card>)).toContain('data-padding="none"');
    expect(renderToStaticMarkup(<Card as="li">Row</Card>)).toContain("<li ");
  });

  it("sizes a control row from its field count rather than its page", () => {
    expect(renderToStaticMarkup(<ControlRow fields={2}>Fields</ControlRow>)).toContain(
      'data-fields="2"',
    );
    expect(renderToStaticMarkup(<ControlRow fields={3}>Fields</ControlRow>)).toContain(
      'data-fields="3"',
    );
    expect(renderToStaticMarkup(<ControlRow fields={2}>Fields</ControlRow>)).toContain(
      'class="jr-panel jr-control-row"',
    );
  });

  it("shares control-row presentation with a row that must be another component", () => {
    expect(controlRowAttributes(3, "filter-bar")).toEqual({
      className: "jr-panel jr-control-row filter-bar",
      "data-fields": 3,
    });
    expect(controlRowAttributes(1)).toEqual({
      className: "jr-panel jr-control-row",
      "data-fields": 1,
    });
  });

  it("renders a busy primary button with native button semantics", () => {
    const html = renderToStaticMarkup(
      <Button busy variant="primary">
        Save
      </Button>,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('class="jr-button"');
    expect(html).toContain('data-variant="primary"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
  });

  it("shares button presentation with link-like controls", () => {
    expect(buttonAttributes("primary", "route-action")).toEqual({
      className: "jr-button route-action",
      "data-variant": "primary",
    });
  });

  it("renders an icon-only action with an accessible name and pressed state", () => {
    const html = renderToStaticMarkup(
      <IconButton label="Archive job" pressed variant="outlined">
        ×
      </IconButton>,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('class="jr-icon-button"');
    expect(html).toContain('aria-label="Archive job"');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('data-variant="outlined"');
  });

  it("renders a compact visual notification count without duplicating the parent label", () => {
    const html = renderToStaticMarkup(<NotificationBadge count={12} />);

    expect(html).toContain('class="jr-notification-badge"');
    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain(">12</span>");
    expect(renderToStaticMarkup(<NotificationBadge count={0} />)).toBe("");
  });

  it("connects a text field to its label, hint, and error", () => {
    const html = renderToStaticMarkup(
      <TextField id="profile-name" label="Name" hint="Used in run history" error="Required" />,
    );

    expect(html).toContain('for="profile-name"');
    expect(html).toContain('id="profile-name"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="profile-name-hint profile-name-error"');
  });

  it("renders a unit beside a text field without a second bordered box", () => {
    const html = renderToStaticMarkup(
      <TextField id="max-age" label="Maximum age" name="maxAgeDays" suffix="days" type="number" />,
    );

    expect(html).toContain("jr-text-field-shell");
    expect(html).toContain('class="jr-text-field-suffix">days</span>');
    expect(html).toContain('id="max-age"');
    // The unit is decoration; the field keeps its own accessible name from the label.
    expect(html).toContain('for="max-age"');
  });

  it("omits the shell entirely when a text field carries no unit", () => {
    const html = renderToStaticMarkup(<TextField id="profile-name" label="Name" />);

    expect(html).not.toContain("jr-text-field-shell");
    expect(html).not.toContain("jr-text-field-suffix");
  });

  it("connects a native select to the shared field, hint, and error contract", () => {
    const html = renderToStaticMarkup(
      <SelectField
        error="Choose an available provider"
        hint="Used for the next search"
        id="search-provider"
        label="Search provider"
        required
      >
        <option value="brave">Brave Search</option>
      </SelectField>,
    );

    expect(html).toContain('class="jr-field jr-select-field-group"');
    expect(html).toContain('class="jr-select-field"');
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('aria-describedby="search-provider-hint search-provider-error"');
    expect(html).toContain("Search provider (required)");
  });

  it("exposes switch state through accessible control semantics", () => {
    const html = renderToStaticMarkup(<Switch checked label="Include remote roles" />);

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('aria-label="Include remote roles"');
    expect(html).toContain('class="jr-switch"');
    expect(html).toContain('data-state="checked"');
  });

  it("does not render a closed modal and labels an open modal", () => {
    expect(renderToStaticMarkup(<Modal open={false} title="Filters" />)).toBe("");

    const html = renderToStaticMarkup(<Modal open title="Filters" />);
    expect(html).toContain("<dialog");
    expect(html).toContain('class="jr-modal"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain("Filters");
  });

  it("gives a dismissible modal an accessible close control", () => {
    const html = renderToStaticMarkup(<Modal open title="Filters" onClose={() => undefined} />);

    expect(html).toContain('aria-label="Close dialog"');
  });

  it.each(["warning", "danger", "success", "neutral"] as const)(
    "exposes the panel %s tone without product classes",
    (tone) => {
      const html = renderToStaticMarkup(<Panel tone={tone}>Outcome</Panel>);
      expect(html).toContain(`data-tone="${tone}"`);
      expect(html).toContain('class="jr-panel"');
    },
  );

  it("keeps decorative skeletons out of the accessibility tree", () => {
    const html = renderToStaticMarkup(<Skeleton width="8rem" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("width:8rem");
  });

  it("renders a context-neutral page heading with optional actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Profiles" description="Manage saved criteria" actions="Add" />,
    );

    expect(html).not.toContain("jr-page-index");
    expect(html).toContain('data-has-actions="true"');
    expect(html).toContain("Profiles");
    expect(html).toContain("Manage saved criteria");
    expect(html).toContain("Add");
  });

  it("lets a page header without actions use its full width", () => {
    const html = renderToStaticMarkup(
      <PageHeader title="Recruiter Search" description="Research public sources" />,
    );

    expect(html).not.toContain("data-has-actions");
  });

  it("keeps section titles, metadata, and actions on one shared edge-aligned contract", () => {
    const html = renderToStaticMarkup(
      <SectionHeader
        actions={<button type="button">Refresh</button>}
        id="matches-title"
        meta="15 active"
        title="Matches"
      />,
    );

    expect(html).toContain('class="jr-section-header"');
    expect(html).toContain('<h2 id="matches-title">Matches</h2>');
    expect(html).toContain('class="jr-section-header-trailing"');
    expect(html).toContain("15 active");
    expect(html).toContain("Refresh");
  });

  it("owns the shared tab-navigation structure and spacing level", () => {
    const html = renderToStaticMarkup(
      <TabNavigation label="Settings" level="secondary">
        <a href="/settings/adapters">Adapters</a>
      </TabNavigation>,
    );

    expect(html).toContain('<nav aria-label="Settings" class="jr-tab-navigation"');
    expect(html).toContain('data-level="secondary"');
    expect(html).toContain("Adapters");
  });
});
