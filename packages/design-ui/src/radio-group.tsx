import type { ReactNode } from "react";

export interface RadioOption {
  readonly description?: ReactNode;
  readonly label: ReactNode;
  readonly value: string;
}

export interface RadioGroupProps {
  /** Identifies this group in the document. A list renders one group per row under a single
   * form field name, so the element ids cannot be derived from that name. */
  readonly id: string;
  readonly legend: ReactNode;
  readonly name: string;
  readonly onChange?: (value: string) => void;
  readonly options: readonly RadioOption[];
  readonly value: string;
}

export function RadioGroup({ id, legend, name, onChange, options, value }: RadioGroupProps) {
  return (
    <fieldset className="jr-radio-group">
      <legend className="jr-field-label">{legend}</legend>
      {options.map((option) => {
        const optionId = `${id}-${option.value}`;
        return (
          <label className="jr-radio" key={option.value} htmlFor={optionId}>
            <input
              aria-labelledby={`${optionId}-label`}
              aria-describedby={option.description ? `${optionId}-description` : undefined}
              checked={value === option.value}
              className="jr-radio-control"
              id={optionId}
              name={name}
              onChange={() => onChange?.(option.value)}
              type="radio"
              value={option.value}
            />
            <span className="jr-radio-copy">
              <span id={`${optionId}-label`}>{option.label}</span>
              {option.description ? (
                <span id={`${optionId}-description`}>{option.description}</span>
              ) : null}
            </span>
          </label>
        );
      })}
    </fieldset>
  );
}
