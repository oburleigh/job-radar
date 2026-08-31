import type { ReactNode } from "react";

export interface SectionHeaderProps {
  readonly actions?: ReactNode;
  readonly description?: ReactNode;
  readonly eyebrow?: ReactNode;
  readonly id?: string;
  readonly meta?: ReactNode;
  readonly title: ReactNode;
  readonly variant?: "contained" | "edge";
}

export function SectionHeader({
  actions,
  description,
  eyebrow,
  id,
  meta,
  title,
  variant = "edge",
}: SectionHeaderProps) {
  return (
    <header className="jr-section-header" data-variant={variant}>
      <div className="jr-section-header-copy">
        {eyebrow ? <p className="jr-section-header-eyebrow">{eyebrow}</p> : null}
        <h2 id={id}>{title}</h2>
        {description ? <p>{description}</p> : null}
      </div>
      {meta || actions ? (
        <div className="jr-section-header-trailing">
          {meta ? <span>{meta}</span> : null}
          {actions}
        </div>
      ) : null}
    </header>
  );
}
