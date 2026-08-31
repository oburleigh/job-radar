import type { SelectHTMLAttributes } from "react";

export interface SelectFieldProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "id"> {
  readonly error?: string;
  readonly hint?: string;
  readonly id: string;
  readonly label: string;
}

export function SelectField({ error, hint, id, label, ...selectProps }: SelectFieldProps) {
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <label className="jr-field jr-select-field-group" htmlFor={id}>
      <span className="jr-field-label">
        {label}
        {selectProps.required ? " (required)" : ""}
      </span>
      <select
        {...selectProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={["jr-select-field", selectProps.className].filter(Boolean).join(" ")}
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
