"use client";

import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";

export function FormField({ label, optional, hint, error, className = "", children }: { label: string; optional?: boolean; hint?: string; error?: string; className?: string; children: ReactNode }) {
  const messageId = useId();
  const control = isValidElement(children) ? cloneElement(children as ReactElement<{ "aria-invalid"?: boolean; "aria-describedby"?: string }>, { "aria-invalid": !!error, "aria-describedby": error || hint ? messageId : undefined }) : children;
  return <label className={`form-field stable-form-field ${className}`.trim()}><span className="field-label">{label}{optional && <small>Optional</small>}</span>{control}<small className={`field-message-slot${error ? " field-error" : ""}`} id={messageId}>{error || hint || "\u00a0"}</small></label>;
}
