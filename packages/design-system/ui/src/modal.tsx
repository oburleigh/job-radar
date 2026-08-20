import { type ReactNode, useId } from "react";

import { Button } from "./button.js";

export interface ModalProps {
  readonly actions?: ReactNode;
  readonly children?: ReactNode;
  readonly onClose?: () => void;
  readonly open: boolean;
  readonly title: string;
}

export function Modal({ actions, children, onClose, open, title }: ModalProps) {
  const titleId = useId();
  if (!open) {
    return null;
  }

  return (
    <div className="jr-modal-backdrop">
      <section aria-labelledby={titleId} aria-modal="true" className="jr-modal" role="dialog">
        <header className="jr-modal-header">
          <h2 id={titleId}>{title}</h2>
          {onClose ? (
            <Button aria-label="Close dialog" onClick={onClose}>
              Close
            </Button>
          ) : null}
        </header>
        {children ? <div className="jr-modal-content">{children}</div> : null}
        {actions ? <footer className="jr-modal-actions">{actions}</footer> : null}
      </section>
    </div>
  );
}
