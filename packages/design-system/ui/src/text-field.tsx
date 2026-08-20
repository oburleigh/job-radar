import type { InputHTMLAttributes } from "react";

export interface TextFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  readonly error?: string;
  readonly hint?: string;
  readonly id: string;
  readonly label: string;
}

export function TextField({ error, hint, id, label, ...inputProps }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <label className="jr-field" htmlFor={id}>
      <span className="jr-field-label">{label}</span>
      <input
        {...inputProps}
        aria-describedby={describedBy || undefined}
        aria-invalid={error ? true : undefined}
        className={["jr-text-field", inputProps.className].filter(Boolean).join(" ")}
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
