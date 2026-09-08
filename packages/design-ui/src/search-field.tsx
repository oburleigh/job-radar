import type { InputHTMLAttributes, ReactNode } from "react";

export interface SearchFieldProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "id"> {
  readonly icon?: ReactNode;
  readonly id: string;
  readonly label: string;
}

/**
 * A search input with a leading mark. The product drew this by hand in a bordered wrapper around a
 * bare input, which is the pattern this component exists to own. The mark is passed in because the
 * package carries no icon library.
 */
export function SearchField({ icon, id, label, ...inputProps }: SearchFieldProps) {
  return (
    <label className="jr-field jr-search-field-group" htmlFor={id}>
      <span className="jr-field-label">{label}</span>
      <span className="jr-search-field">
        {icon ? (
          <span aria-hidden="true" className="jr-search-field-mark">
            {icon}
          </span>
        ) : null}
        <input
          {...inputProps}
          className={["jr-search-field-control", inputProps.className].filter(Boolean).join(" ")}
          id={id}
          type="search"
        />
      </span>
    </label>
  );
}
