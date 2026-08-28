import { LocationAutocomplete } from "@/platform/http/location-autocomplete";
import type { LocationOption } from "@/platform/http/location-option";
import {
  type CountryCurrencyOption,
  countryCurrencyOptionForCode,
} from "./country-currency-catalogue";

interface LocationComboboxProps {
  readonly error?: string | undefined;
  readonly name: string;
  readonly initialOptions?: readonly LocationOption[] | undefined;
  readonly onCountrySelected?: ((option: CountryCurrencyOption) => void) | undefined;
  readonly values: readonly string[];
  readonly onChange: (values: readonly string[]) => void;
}

export function LocationCombobox({
  error,
  initialOptions,
  name,
  onChange,
  onCountrySelected,
  values,
}: LocationComboboxProps) {
  return (
    <LocationAutocomplete
      {...(error ? { error } : {})}
      hint="Choose countries, administrative areas, or cities to include in discovery."
      {...(initialOptions ? { initialOptions } : {})}
      name={name}
      onChange={onChange}
      onLocationSelected={(location) => {
        const country = countryCurrencyOptionForCode(location.countryCode);
        if (country) {
          onCountrySelected?.(country);
        }
      }}
      values={values}
    />
  );
}
