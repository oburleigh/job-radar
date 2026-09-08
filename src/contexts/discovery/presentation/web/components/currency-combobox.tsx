import { Combobox, type ComboboxOption } from "@job-radar/design-ui";
import { useMemo } from "react";

import { currencyOptions } from "./country-currency-catalogue";

interface CurrencyComboboxProps {
  readonly error?: string | undefined;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

/**
 * The shared Combobox owns the listbox, filtering and keyboard contract. This supplies the
 * currency catalogue and nothing else.
 */
export function CurrencyCombobox({ error, name, onChange, value }: CurrencyComboboxProps) {
  const options = useMemo<readonly ComboboxOption[]>(
    () =>
      currencyOptions.map((option) => ({
        detail: option.currencyName,
        label: option.currencyCode,
        searchTerms: [option.currencyName, ...option.countryNames],
        value: option.currencyCode,
      })),
    [],
  );

  return (
    <Combobox
      {...(error === undefined ? {} : { error })}
      id="profile-salary-currency"
      label="Salary currency"
      name={name}
      onChange={onChange}
      options={options}
      placeholder="Search code, currency, or country"
      value={value}
    />
  );
}
