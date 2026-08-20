import type { ReactNode } from "react";

export interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly description: string;
  readonly index: string;
  readonly title: string;
}

export function PageHeader({ actions, description, index, title }: PageHeaderProps) {
  return (
    <header className="jr-page-header">
      <div className="jr-page-title-block">
        <span className="jr-page-index" aria-hidden="true">
          {index}
        </span>
        <div>
          <h1>{title}</h1>
          <p className="jr-page-description">{description}</p>
        </div>
      </div>
      {actions ? <div className="jr-header-actions">{actions}</div> : null}
    </header>
  );
}
