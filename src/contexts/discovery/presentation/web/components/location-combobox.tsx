import { TokenAutocomplete, type TokenAutocompleteOption } from "@job-radar/design-ui";

import {
  type CountryCurrencyOption,
  countryCurrencyOptions,
  countryOptionFor,
  normaliseCountryName,
} from "./country-currency-catalogue";

interface LocationComboboxProps {
  readonly error?: string | undefined;
  readonly name: string;
  readonly onCountrySelected?: ((option: CountryCurrencyOption) => void) | undefined;
  readonly values: readonly string[];
  readonly onChange: (values: readonly string[]) => void;
}

const options: readonly TokenAutocompleteOption[] = countryCurrencyOptions.map((country) => ({
  detail: country.currencyCode,
  label: country.countryName,
  value: country.countryName,
}));

export function LocationCombobox({
  error,
  name,
  onChange,
  onCountrySelected,
  values,
}: LocationComboboxProps) {
  const canonicalValues = values.map((value) => countryOptionFor(value)?.countryName ?? value);
  const legacyValues = canonicalValues.filter((value) => countryOptionFor(value) === undefined);

  return (
    <>
      <TokenAutocomplete
        {...(error ? { error } : {})}
        includeUnavailableValuesInFormValue={false}
        invalidSelectionMessage="Choose a target location from the suggestions."
        invalidValueMessage="Replace saved target locations that are not in the location catalogue."
        label="Target locations"
        name={name}
        onChange={onChange}
        onOptionSelected={(option) => {
          const country = countryOptionFor(option.value);
          if (country) {
            onCountrySelected?.(country);
          }
        }}
        options={options}
        placeholder="United Arab Emirates or China"
        secondaryPlaceholder="Add another location"
        valueNormalizer={normaliseCountryName}
        values={canonicalValues}
      />
      {legacyValues.length > 0 ? (
        <input name="legacyLocationTerms" type="hidden" value={legacyValues.join("\n")} readOnly />
      ) : null}
    </>
  );
}
