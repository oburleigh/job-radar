import type { ReactNode } from "react";

export interface PageHeaderProps {
  readonly actions?: ReactNode;
  readonly description: string;
  readonly title: string;
}

export function PageHeader({ actions, description, title }: PageHeaderProps) {
  return (
    <header className="jr-page-header" data-has-actions={actions ? true : undefined}>
      <div className="jr-page-title-block">
        <div>
          <h1>{title}</h1>
          <p className="jr-page-description">{description}</p>
        </div>
      </div>
      {actions ? <div className="jr-header-actions">{actions}</div> : null}
    </header>
  );
}
