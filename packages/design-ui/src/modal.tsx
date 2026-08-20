import { type ReactNode, type SyntheticEvent, useEffect, useId, useRef } from "react";

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
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) {
      return;
    }
    if (!open) {
      if (dialog.open) {
        dialog.close();
      }
      return;
    }
    if (typeof dialog.showModal === "function") {
      if (dialog.open) {
        dialog.close();
      }
      dialog.showModal();
    }
    return () => {
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open]);

  if (!open) {
    return null;
  }

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onClose?.();
  }

  return (
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className="jr-modal"
      onCancel={handleCancel}
      open
      ref={dialogRef}
    >
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
    </dialog>
  );
}
