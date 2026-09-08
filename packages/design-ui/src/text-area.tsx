import type { TextareaHTMLAttributes } from "react";

export interface TextAreaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "id"> {
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly id: string;
  readonly label: string;
}

export function TextArea({ error, hint, id, label, ...textAreaProps }: TextAreaProps) {
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <label className="jr-field" htmlFor={id}>
      <span className="jr-field-label">
        {label}
        {textAreaProps.required ? " (required)" : ""}
      </span>
      <textarea
        {...textAreaProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={["jr-text-area", textAreaProps.className].filter(Boolean).join(" ")}
        id={id}
      />
      {hint ? (
        <small className="jr-field-hint" id={`${id}-hint`}>
          {hint}
        </small>
      ) : null}
      {error ? (
        <small className="jr-field-error" id={`${id}-error`}>
          {error}
        </small>
      ) : null}
    </label>
  );
}
