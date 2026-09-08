import type { InputHTMLAttributes, ReactNode } from "react";

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id" | "type"> {
  readonly description?: ReactNode;
  readonly id: string;
  readonly label: ReactNode;
}

export function Checkbox({ description, id, label, ...inputProps }: CheckboxProps) {
  return (
    <label className="jr-checkbox" htmlFor={id}>
      <input
        {...inputProps}
        aria-labelledby={`${id}-label`}
        aria-describedby={description ? `${id}-description` : undefined}
        className={["jr-checkbox-control", inputProps.className].filter(Boolean).join(" ")}
        id={id}
        type="checkbox"
      />
      <span className="jr-checkbox-copy">
        <span id={`${id}-label`}>{label}</span>
        {description ? <span id={`${id}-description`}>{description}</span> : null}
      </span>
    </label>
  );
}
