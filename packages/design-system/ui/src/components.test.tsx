import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { Button, Modal, PageHeader, Skeleton, Switch, TextField } from "./index";

describe("generic UI public contract", () => {
  it("renders a busy primary button with native button semantics", () => {
    const html = renderToStaticMarkup(
      <Button busy variant="primary">
        Save
      </Button>,
    );

    expect(html).toContain('type="button"');
    expect(html).toContain("jr-button-primary");
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("disabled");
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
  });

  it("does not render a closed modal and labels an open modal", () => {
    expect(renderToStaticMarkup(<Modal open={false} title="Filters" />)).toBe("");

    const html = renderToStaticMarkup(<Modal open title="Filters" />);
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="');
    expect(html).toContain("Filters");
  });

  it("keeps decorative skeletons out of the accessibility tree", () => {
    const html = renderToStaticMarkup(<Skeleton width="8rem" />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("width:8rem");
  });

  it("renders a context-neutral page heading with optional actions", () => {
    const html = renderToStaticMarkup(
      <PageHeader index="02" title="Profiles" description="Manage saved criteria" actions="Add" />,
    );

    expect(html).toContain("02");
    expect(html).toContain("Profiles");
    expect(html).toContain("Manage saved criteria");
    expect(html).toContain("Add");
  });
});
