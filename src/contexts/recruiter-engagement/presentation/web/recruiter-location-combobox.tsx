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
      hint="Start typing, then choose a location from the suggestions."
      id="recruiter-target-locations"
      {...(initialOptions ? { initialOptions } : {})}
      name={name}
      label="Target locations"
      onChange={onChange}
      placeholder="Type a country, city, or region"
      required
      values={values}
    />
  );
}
