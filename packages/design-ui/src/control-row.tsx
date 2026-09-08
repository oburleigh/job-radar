import type { HTMLAttributes, ReactNode } from "react";

export type ControlRowFields = 1 | 2 | 3 | 4;

export interface ControlRowProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  /** Flexible field tracks. A trailing track sizes itself to the row's action. */
  readonly fields: ControlRowFields;
}

/**
 * A row of controls in a panel. The tracks belong to the panel rather than the page, so two rows
 * of the same shape on different pages cannot render their fields at different widths.
 */
export function ControlRow({ children, className, fields, ...rest }: ControlRowProps) {
  return (
    <div {...rest} {...controlRowAttributes(fields, className)}>
      {children}
    </div>
  );
}

/**
 * The same presentation for a row that has to be another component's element, such as a router
 * form. `Button` shares itself with link-like controls the same way.
 */
export function controlRowAttributes(fields: ControlRowFields, className?: string) {
  return {
    className: ["jr-panel", "jr-control-row", className].filter(Boolean).join(" "),
    "data-fields": fields,
  } as const;
}
