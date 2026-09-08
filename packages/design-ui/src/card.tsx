import type { HTMLAttributes, ReactNode } from "react";

export type CardElement = "article" | "div" | "li" | "section";

export interface CardProps extends HTMLAttributes<HTMLElement> {
  readonly as?: CardElement;
  readonly children: ReactNode;
  /** `none` suits a card whose own regions carry the inset, such as a row split into columns. */
  readonly padding?: "comfortable" | "none" | undefined;
  readonly tone?: "default" | "retired" | "outlined" | undefined;
}

/** One record inside a page, a step down in radius from the panel a set of them sits in. */
export function Card({
  as: Element = "article",
  children,
  className,
  padding,
  tone,
  ...rest
}: CardProps) {
  return (
    <Element
      {...rest}
      className={["jr-card", className].filter(Boolean).join(" ")}
      data-padding={padding}
      data-tone={tone}
    >
      {children}
    </Element>
  );
}
