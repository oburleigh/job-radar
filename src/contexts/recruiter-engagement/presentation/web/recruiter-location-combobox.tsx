import { LocationAutocomplete } from "@/platform/http/location-autocomplete";
import type { LocationOption } from "@/platform/http/location-option";

type RecruiterLocationComboboxProps = {
  readonly disabled?: boolean;
  readonly error?: string;
  readonly initialOptions?: readonly LocationOption[];
  readonly name: string;
  readonly onChange: (values: readonly string[]) => void;
  readonly values: readonly string[];
};

export function RecruiterLocationCombobox({
  disabled,
  error,
  initialOptions,
  name,
  onChange,
  values,
}: RecruiterLocationComboboxProps) {
  return (
    <LocationAutocomplete
      {...(disabled ? { disabled } : {})}
      {...(error ? { error } : {})}
      hint="Choose countries, administrative areas, or cities for both research stages."
      id="recruiter-target-locations"
      {...(initialOptions ? { initialOptions } : {})}
      name={name}
      label="Target locations (required)"
      onChange={onChange}
      required
      values={values}
    />
  );
}
