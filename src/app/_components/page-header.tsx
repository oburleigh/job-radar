interface PageHeaderProps {
  index: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}

export function PageHeader({ index, title, description, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-title-block">
        <span className="page-index" aria-hidden="true">
          {index}
        </span>
        <div>
          <h1>{title}</h1>
          <p className="page-description">{description}</p>
        </div>
      </div>
      {actions ? <div className="header-actions">{actions}</div> : null}
    </header>
  );
}
