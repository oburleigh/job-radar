import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { componentAppearanceViolations, productAppearanceViolations } from "./component-appearance";

describe("component appearance ownership", () => {
  it("discovers new imported CSS and inline appearance outside the original stylesheet inventory", () => {
    const root = mkdtempSync(path.join(tmpdir(), "design-ownership-"));
    try {
      mkdirSync(path.join(root, "new-surface"));
      writeFileSync(
        path.join(root, "entry.tsx"),
        'import "./new-surface/extra.css"; import { Textarea as Editor } from "@job-radar/design-ui"; const editor = <Editor className="code-field" />;',
      );
      writeFileSync(
        path.join(root, "new-surface/extra.css"),
        ".code-field { border-bottom: 1rem solid; }",
      );
      writeFileSync(
        path.join(root, "new-surface/page.tsx"),
        "const page = <Button style={{paddingLeft: 40}} />;",
      );
      const violations = productAppearanceViolations(root);
      expect(violations).toHaveLength(2);
      expect(
        violations.some((entry) => entry.includes("extra.css") && entry.includes("border-bottom")),
      ).toBe(true);
      expect(
        violations.some((entry) => entry.includes("page.tsx") && entry.includes("paddingLeft")),
      ).toBe(true);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each([
    ".filter-field select { font-size: 14px; }",
    ".search-field input { padding: 0; }",
    ".known-role-form input { background: red; }",
    ".search-field > * { padding: 0; }",
    '.search-field [type="search"] { padding: 0; }',
    ".recruiter-directory-confirm fieldset { padding: 0; }",
    ".filter-field option { font-size: 14px; }",
    ".page .jr-text-field { padding: 4rem; }",
    ".page .jr-text-field { padding-left: 4rem; }",
    ".page .jr-button { border-bottom: 1rem solid currentColor; }",
    ".page { .jr-button { border-block-end-color: red; } }",
    ".jr-button { @media (width > 30rem) { &:hover { padding-inline-start: 4rem; } } }",
    ".jr-button { --jr-color-text: red; }",
    ".jr-button { gap: 4rem; }",
    String.raw`.jr-\62 utton { padding: 4rem; }`,
    '[class~="jr-button"] { border-bottom: 2rem solid; }',
  ])("rejects appearance in CSS: %s", (source) => {
    expect(componentAppearanceViolations("newly-imported.css", source)).not.toEqual([]);
  });

  it.each([
    "const page = <Button style={{ paddingLeft: 40 }} />;",
    "const page = <RenamedButton style={{ borderBottom: '1rem solid red' }} />;",
    "const page = <Button style={appearance} />;",
    "const page = <Button style={{ ...appearance }} />;",
    "const page = <Button style={{ [property]: value }} />;",
  ])("rejects inline appearance and uninspectable style: %s", (source) => {
    expect(componentAppearanceViolations("page.tsx", source)).not.toEqual([]);
  });

  it("permits content layout on containers while retaining appearance ownership", () => {
    const classes = new Map([
      ["content-card", true],
      ["action", false],
    ]);
    expect(
      componentAppearanceViolations(
        "page.css",
        ".content-card { display: grid; gap: 2rem; grid-template-columns: 1fr 1fr; } .jr-panel { min-height: 20rem; }",
        classes,
      ),
    ).toEqual([]);
    expect(
      componentAppearanceViolations(
        "page.css",
        ".content-card { padding-left: 2rem; } .action { gap: 2rem; }",
        classes,
      ),
    ).toHaveLength(2);
    expect(
      componentAppearanceViolations("page.css", ".content-card p { color: red; }", classes),
    ).toEqual([]);
  });

  it("allows page placement including responsive outer sizing", () => {
    expect(
      componentAppearanceViolations(
        "layout.css",
        `
      .jr-button { margin-inline-start: auto; grid-column: 1 / -1; align-self: start; }
      @media (width < 40rem) { .jr-button { width: 100%; min-width: 0; max-width: 40rem; } }
      .page { display: grid; gap: 2rem; }
      .known-role-form [role="alert"] { color: var(--jr-color-danger); }
    `,
      ),
    ).toEqual([]);
    expect(
      componentAppearanceViolations(
        "page.tsx",
        `
      const page = <Button style={{ marginInlineStart: 'auto', gridColumn: '1 / -1', width: '100%' }} />;
    `,
      ),
    ).toEqual([]);
  });

  it("ignores apparent rules and style attributes in comments and strings", () => {
    expect(
      componentAppearanceViolations(
        "page.css",
        "/* .jr-button { padding: 4rem; } */ .page { color: red; }",
      ),
    ).toEqual([]);
    expect(
      componentAppearanceViolations(
        "page.tsx",
        `const example = '<Button style={{padding: 40}} />';`,
      ),
    ).toEqual([]);
  });
});
