"use client";

import { createPortal } from "react-dom";
import { useId } from "react";
import { AppIcon } from "@/components/app-icons";
import { useModalDialog } from "@/components/use-modal-dialog";

type ModalDialogProps = {
  title: string;
  eyebrow: string;
  close: () => void;
  children: React.ReactNode;
  className?: string;
  closeLabel?: string;
  closeOnBackdrop?: boolean;
};

export function ModalDialog({ title, eyebrow, close, children, className = "", closeLabel = "Close dialog", closeOnBackdrop = true }: ModalDialogProps) {
  const ref = useModalDialog<HTMLElement>(close);
  const titleId = useId();
  return createPortal(
    <div className="dialog-backdrop app-dialog-backdrop" onMouseDown={(event) => { if (closeOnBackdrop && event.target === event.currentTarget) close(); }}>
      <section ref={ref} tabIndex={-1} className={`confirm-dialog ${className}`.trim()} role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <div className="repeat-card-heading">
          <div><p className="app-eyebrow">{eyebrow}</p><h2 id={titleId}>{title}</h2></div>
          <button className="dialog-close-button" onClick={close} type="button" aria-label={closeLabel}><AppIcon name="close" /></button>
        </div>
        {children}
      </section>
    </div>,
    document.body,
  );
}

type ConfirmationDialogProps = {
  title: string;
  description: string;
  confirmLabel: string;
  close: () => void;
  confirm: () => void | Promise<void>;
  eyebrow?: string;
  error?: string;
  busy?: boolean;
  destructive?: boolean;
};

export function ConfirmationDialog({ title, description, confirmLabel, close, confirm, eyebrow = "Confirm action", error, busy = false, destructive = true }: ConfirmationDialogProps) {
  return <ModalDialog title={title} eyebrow={eyebrow} close={close} className="confirmation-dialog" closeLabel="Close confirmation">
    <p>{description}</p>
    {error && <p className="form-message is-error" role="alert">{error}</p>}
    <div className="confirm-dialog-actions">
      <button className="app-button app-button-secondary" type="button" onClick={close} disabled={busy} data-modal-initial-focus>Cancel</button>
      <button className={`app-button${destructive ? " danger-button" : ""}`} type="button" onClick={confirm} disabled={busy}>{busy ? "Please wait…" : confirmLabel}</button>
    </div>
  </ModalDialog>;
}
