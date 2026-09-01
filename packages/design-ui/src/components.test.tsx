import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Button,
  buttonAttributes,
  IconButton,
  Modal,
  NotificationBadge,
  PageHeader,
  SectionHeader,
  SelectField,
  Skeleton,
  Switch,
  TabNavigation,
  TextField,
} from "./index";

describe("generic UI public contract", () => {
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
