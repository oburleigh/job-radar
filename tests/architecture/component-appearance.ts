import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse as parseScript } from "@babel/parser";
import postcss from "postcss";
import selectorParser from "postcss-selector-parser";

// Consumers place the outside of a component; its internal spacing and appearance are owned.
const placementProperties = new Set([
  "display",
  "margin",
  "margin-top",
  "margin-right",
  "margin-bottom",
  "margin-left",
  "margin-block",
  "margin-block-start",
  "margin-block-end",
  "margin-inline",
  "margin-inline-start",
  "margin-inline-end",
  "grid-area",
  "grid-column",
  "grid-column-start",
  "grid-column-end",
  "grid-row",
  "grid-row-start",
  "grid-row-end",
  "align-self",
  "justify-self",
  "place-self",
  "order",
  "flex",
  "flex-grow",
  "flex-shrink",
  "flex-basis",
  "width",
  "min-width",
  "max-width",
  "inline-size",
  "min-inline-size",
  "max-inline-size",
  "position",
  "top",
  "right",
  "bottom",
  "left",
  "inset",
  "inset-block",
  "inset-block-start",
  "inset-block-end",
  "inset-inline",
  "inset-inline-start",
  "inset-inline-end",
  "z-index",
]);

const contentLayoutProperties = new Set([
  "grid",
  "grid-template",
  "grid-template-columns",
  "grid-template-rows",
  "grid-template-areas",
  "grid-auto-flow",
  "grid-auto-columns",
  "grid-auto-rows",
  "gap",
  "row-gap",
  "column-gap",
  "align-items",
  "align-content",
  "justify-items",
  "justify-content",
  "place-items",
  "place-content",
  "flex-direction",
  "flex-wrap",
  "height",
  "min-height",
  "max-height",
  "text-align",
]);

export function productAppearanceViolations(directory: string): string[] {
  const sources = productSources(directory).map((file) => ({
    file,
    source: readFileSync(file, "utf8"),
  }));
  const classes = new Map(
    sources
      .filter(({ file }) => !file.endsWith(".css"))
      .flatMap(({ source }) => componentClasses(source)),
  );
  return sources.flatMap(({ file, source }) =>
    componentAppearanceViolations(file, source, classes),
  );
}

function productSources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return productSources(file);
    return /\.(?:css|[cm]?[jt]sx?)$/.test(file) && !/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(file)
      ? [file]
      : [];
  });
}

function componentClasses(source: string): Array<[string, boolean]> {
  const tree = parseScript(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  const components = new Map<string, boolean>();
  for (const statement of tree.program.body) {
    if (
      statement.type === "ImportDeclaration" &&
      statement.source.value === "@job-radar/design-ui"
    ) {
      for (const specifier of statement.specifiers) {
        const imported =
          specifier.type === "ImportSpecifier" && specifier.imported.type === "Identifier"
            ? specifier.imported.name
            : undefined;
        components.set(specifier.local.name, imported === "Card" || imported === "Panel");
      }
    }
  }
  const classes: Array<[string, boolean]> = [];
  walk(tree, (node) => {
    if (
      node.type !== "JSXOpeningElement" ||
      !isRecord(node.name) ||
      typeof node.name.name !== "string" ||
      !components.has(node.name.name) ||
      !Array.isArray(node.attributes)
    )
      return;
    const ownsContent = components.get(node.name.name) ?? false;
    for (const attribute of node.attributes) {
      if (!isRecord(attribute) || !isRecord(attribute.name) || attribute.name.name !== "className")
        continue;
      walk(attribute.value, (value) => {
        if (value.type === "StringLiteral" && typeof value.value === "string")
          classes.push(
            ...value.value
              .split(/\s+/)
              .filter(Boolean)
              .map((name): [string, boolean] => [name, ownsContent]),
          );
        if (
          value.type === "TemplateElement" &&
          isRecord(value.value) &&
          typeof value.value.raw === "string"
        )
          classes.push(
            ...value.value.raw
              .split(/\s+/)
              .filter(Boolean)
              .map((name): [string, boolean] => [name, ownsContent]),
          );
      });
    }
  });
  return classes;
}

export function componentAppearanceViolations(
  file: string,
  source: string,
  componentClasses: ReadonlyMap<string, boolean> = new Map(),
): string[] {
  const violations: string[] = [];
  if (file.endsWith(".css")) {
    postcss.parse(source, { from: file }).walkDecls((declaration) => {
      let ancestor: postcss.Container | postcss.Document | undefined = declaration.parent;
      const selectors: string[] = [];
      while (ancestor) {
        if (
          ancestor.type === "rule" &&
          "selector" in ancestor &&
          typeof ancestor.selector === "string"
        )
          selectors.push(ancestor.selector);
        ancestor = ancestor.parent;
      }
      if (
        selectors.some((selector) =>
          targetsComponent(selector, componentClasses, declaration.prop.toLowerCase()),
        ) &&
        !placementProperties.has(declaration.prop.toLowerCase())
      ) {
        violations.push(
          `${file}:${declaration.source?.start?.line} ${selectors.reverse().join(" ")}: ${declaration.prop}`,
        );
      }
    });
    return violations;
  }

  const tree = parseScript(source, { sourceType: "module", plugins: ["typescript", "jsx"] });
  walk(tree, (node) => {
    if (node.type !== "JSXAttribute" || !isRecord(node.name) || node.name.name !== "style") return;
    const value = node.value;
    const expression =
      isRecord(value) && value.type === "JSXExpressionContainer" ? value.expression : undefined;
    const properties =
      isRecord(expression) && expression.type === "ObjectExpression"
        ? expression.properties
        : undefined;
    if (!Array.isArray(properties)) {
      violations.push(`${file}: inline style must expose placement properties`);
      return;
    }
    for (const property of properties) {
      const key =
        isRecord(property) &&
        property.type === "ObjectProperty" &&
        !property.computed &&
        isRecord(property.key)
          ? (property.key.name ?? property.key.value)
          : undefined;
      if (
        typeof key !== "string" ||
        !placementProperties.has(key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`))
      ) {
        violations.push(
          `${file}: inline style ${typeof key === "string" ? key : "must expose placement properties"}`,
        );
      }
    }
  });
  return violations;
}

function targetsComponent(
  selector: string,
  componentClasses: ReadonlyMap<string, boolean>,
  property: string,
): boolean {
  let owned = false;
  selectorParser((root) => {
    root.walkTags((node) => {
      if (
        ["input", "select", "textarea", "button", "label", "fieldset", "option"].includes(
          node.value.toLowerCase(),
        )
      )
        owned = true;
    });
    root.walkUniversals(() => {
      owned = true;
    });
    root.walkClasses((node) => {
      const after = node.parent?.nodes.slice((node.parent?.index(node) ?? 0) + 1) ?? [];
      if (
        (node.value.startsWith("jr-") &&
          !(
            ["jr-card", "jr-panel"].includes(node.value) && contentLayoutProperties.has(property)
          )) ||
        (componentClasses.has(node.value) &&
          !(componentClasses.get(node.value) && contentLayoutProperties.has(property)) &&
          !after.some((part) => part.type === "combinator"))
      )
        owned = true;
    });
    root.walkAttributes((node) => {
      const before = node.parent?.nodes.slice(0, node.parent.index(node)) ?? [];
      if (
        (before.some(
          (part) =>
            part.type === "class" &&
            (node.attribute === "type" ||
              part.value.startsWith("jr-") ||
              componentClasses.has(part.value)),
        ) &&
          before.some((part) => part.type === "combinator")) ||
        (node.attribute === "class" &&
          node.value
            ?.split(/\s+/)
            .some((value) => value.startsWith("jr-") || componentClasses.has(value)))
      )
        owned = true;
    });
  }).processSync(selector);
  return owned;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function walk(value: unknown, visit: (node: Record<string, unknown>) => void): void {
  if (Array.isArray(value)) {
    for (const child of value) walk(child, visit);
  } else if (isRecord(value)) {
    if (typeof value.type === "string") visit(value);
    for (const [key, child] of Object.entries(value)) {
      if (key !== "loc" && key !== "comments") walk(child, visit);
    }
  }
}
