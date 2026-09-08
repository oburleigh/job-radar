import type { InputHTMLAttributes, ReactNode, RefAttributes } from "react";

export interface TextFieldProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "id">,
    RefAttributes<HTMLInputElement> {
  readonly error?: string | undefined;
  readonly hint?: string | undefined;
  readonly id: string;
  readonly label: string;
  /** A unit shown inside the field's border, such as "days" or "/ 100". Decoration only. */
  readonly suffix?: ReactNode;
}

export function TextField({ error, hint, id, label, suffix, ...inputProps }: TextFieldProps) {
  const describedBy = [hint ? `${id}-hint` : undefined, error ? `${id}-error` : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <label className="jr-field" htmlFor={id}>
      <span className="jr-field-label">
        {label}
        {inputProps.required ? " (required)" : ""}
      </span>
      {suffix === undefined ? (
        <input
          {...inputProps}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? true : undefined}
          className={["jr-text-field", inputProps.className].filter(Boolean).join(" ")}
          id={id}
        />
      ) : (
        <span className="jr-text-field-shell">
          <input
            {...inputProps}
            aria-describedby={describedBy || undefined}
            aria-invalid={error ? true : undefined}
            className={["jr-text-field", inputProps.className].filter(Boolean).join(" ")}
            id={id}
          />
          <span aria-hidden="true" className="jr-text-field-suffix">
            {suffix}
          </span>
        </span>
      )}
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
