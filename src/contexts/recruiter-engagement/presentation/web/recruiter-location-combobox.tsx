import { TokenAutocomplete, type TokenAutocompleteOption } from "@job-radar/design-ui";

import type { TargetLocationOption } from "@/contexts/recruiter-engagement/application/research-runs/target-locations";

type RecruiterLocationComboboxProps = {
  readonly disabled?: boolean;
  readonly error?: string;
  readonly name: string;
  readonly onChange: (values: readonly string[]) => void;
  readonly options: readonly TargetLocationOption[];
  readonly values: readonly string[];
};

export function RecruiterLocationCombobox({
  disabled,
  error,
  name,
  onChange,
  options,
  values,
}: RecruiterLocationComboboxProps) {
  const autocompleteOptions: readonly TokenAutocompleteOption[] = options.map((option) => ({
    label: option.label,
    value: option.label,
  }));

  return (
    <TokenAutocomplete
      {...(disabled ? { disabled } : {})}
      {...(error ? { error } : {})}
      hint="Choose one or more configured markets for both research stages."
      id="recruiter-target-locations"
      invalidValueMessage="Replace or remove saved target locations that are no longer configured."
      label="Target locations"
      name={name}
      onChange={onChange}
      options={autocompleteOptions}
      placeholder="Search configured markets"
      required
      values={values}
    />
  );
}
