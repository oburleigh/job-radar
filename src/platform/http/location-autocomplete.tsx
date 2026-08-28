import { TokenAutocomplete, type TokenAutocompleteOption } from "@job-radar/design-ui";
import { useEffect, useMemo, useRef } from "react";
import { useFetcher } from "react-router";

import type { LocationOption } from "./location-option";

type LocationAutocompleteProps = {
  readonly disabled?: boolean;
  readonly error?: string;
  readonly hint: string;
  readonly id?: string;
  readonly initialOptions?: readonly LocationOption[];
  readonly label?: string;
  readonly name: string;
  readonly onChange: (values: readonly string[]) => void;
  readonly onLocationSelected?: (location: LocationOption) => void;
  readonly required?: boolean;
  readonly values: readonly string[];
};

type LocationOptionsResponse = {
  readonly error?: string;
  readonly options: readonly LocationOption[];
};

export function LocationAutocomplete({
  disabled,
  error,
  hint,
  id,
  initialOptions = [],
  label = "Target locations",
  name,
  onChange,
  onLocationSelected,
  required,
  values,
}: LocationAutocompleteProps) {
  const fetcher = useFetcher<LocationOptionsResponse>();
  const timeout = useRef<number | undefined>(undefined);
  const knownOptions = useRef(
    new Map(
      initialOptions.map((option) => [normaliseLocationLabel(option.label), option] as const),
    ),
  );
  const results = fetcher.data?.options ?? [];

  useEffect(() => {
    for (const option of initialOptions) {
      knownOptions.current.set(normaliseLocationLabel(option.label), option);
    }
    for (const option of results) {
      knownOptions.current.set(normaliseLocationLabel(option.label), option);
    }
  }, [initialOptions, results]);

  useEffect(
    () => () => {
      window.clearTimeout(timeout.current);
    },
    [],
  );

  const options = useMemo<readonly TokenAutocompleteOption[]>(() => {
    const byLabel = new Map<string, TokenAutocompleteOption>();
    for (const result of results) {
      byLabel.set(normaliseLocationLabel(result.label), autocompleteOption(result));
    }
    return [...byLabel.values()];
  }, [results]);
  const selectedOptions = useMemo<readonly TokenAutocompleteOption[]>(
    () =>
      values.flatMap((value) => {
        const known = knownOptions.current.get(normaliseLocationLabel(value));
        return known ? [autocompleteOption(known)] : [];
      }),
    [values],
  );
  const visibleError = error ?? fetcher.data?.error;

  return (
    <TokenAutocomplete
      busy={fetcher.state === "loading"}
      {...(disabled ? { disabled } : {})}
      {...(visibleError ? { error: visibleError } : {})}
      {...(id ? { id } : {})}
      hint={fetcher.state === "loading" ? "Searching locations…" : hint}
      invalidSelectionMessage="Choose a target location from the suggestions."
      invalidValueMessage="Replace saved target locations that are not in the location catalogue."
      label={label}
      name={name}
      onChange={onChange}
      onOptionSelected={(option) => {
        const location = knownOptions.current.get(normaliseLocationLabel(option.value));
        if (location) {
          onLocationSelected?.(location);
        }
      }}
      onQueryChange={(query) => {
        window.clearTimeout(timeout.current);
        timeout.current = window.setTimeout(
          () => fetcher.load(`/api/location-options?q=${encodeURIComponent(query)}`),
          120,
        );
      }}
      options={options}
      placeholder="Search countries, administrative areas, or cities"
      {...(required ? { required } : {})}
      selectedOptions={selectedOptions}
      secondaryPlaceholder="Add another location"
      statusMessage={locationStatus(fetcher.state, fetcher.data)}
      valueNormalizer={normaliseLocationLabel}
      values={values}
    />
  );
}

function normaliseLocationLabel(value: string): string {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter((part, index, parts) => {
      const previous = parts[index - 1];
      return previous === undefined || part.toLocaleLowerCase() !== previous.toLocaleLowerCase();
    })
    .join(", ")
    .toLocaleLowerCase();
}

function locationStatus(
  state: "idle" | "loading" | "submitting",
  data: LocationOptionsResponse | undefined,
): string {
  if (state === "loading") {
    return "Searching locations.";
  }
  if (!data || data.error) {
    return "";
  }
  return data.options.length === 0
    ? "No location suggestions found."
    : `${data.options.length} location suggestions available.`;
}

function autocompleteOption(location: LocationOption): TokenAutocompleteOption {
  return {
    detail: location.detail,
    label: location.label,
    searchTerms: location.searchTerms,
    value: location.label,
  };
}
