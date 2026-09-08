import type { HTMLAttributes, ReactNode } from "react";

export type PanelElement = "article" | "div" | "section";

export interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly as?: PanelElement;
  readonly children: ReactNode;
  readonly overflow?: "clipped" | "visible" | undefined;
  /** `comfortable` insets the contents by the same step a control row uses. */
  readonly padding?: "comfortable" | undefined;
  readonly tone?: "warning" | "danger" | "success" | "neutral" | undefined;
}

/**
 * The page-level box. Every context drew its own before this existed, so Opportunities settled on
 * one radius and Recruiter Search on another and the two pages read as different products.
 */
export function Panel({
  as: Element = "div",
  children,
  className,
  overflow,
  padding,
  tone,
  ...rest
}: PanelProps) {
  return (
    <Element
      {...rest}
      className={["jr-panel", className].filter(Boolean).join(" ")}
      data-overflow={overflow}
      data-padding={padding}
      data-tone={tone}
    >
      {children}
    </Element>
  );
}
