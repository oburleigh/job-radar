import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  Button,
  buttonAttributes,
  IconButton,
  Modal,
  PageHeader,
  Skeleton,
  Switch,
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
      <IconButton label="Archive job" pressed>
        ×
      </IconButton>,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain('class="jr-icon-button"');
    expect(html).toContain('aria-label="Archive job"');
    expect(html).toContain('aria-pressed="true"');
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
      <PageHeader title="Recruiter research" description="Research public sources" />,
    );

    expect(html).not.toContain("data-has-actions");
  });
});
