import { Combobox } from "@base-ui/react/combobox";
import { useId, useMemo, useRef, useState } from "react";

export type TokenAutocompleteOption = {
  readonly detail?: string;
  readonly label: string;
  readonly searchTerms?: readonly string[];
  readonly value: string;
};

export type TokenAutocompleteProps = {
  readonly busy?: boolean;
  readonly className?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly hint?: string;
  readonly id?: string;
  readonly includeUnavailableValuesInFormValue?: boolean;
  readonly invalidSelectionMessage?: string;
  readonly invalidValueMessage?: string;
  readonly label: string;
  readonly name: string;
  readonly onChange: (values: readonly string[]) => void;
  readonly onOptionSelected?: (option: TokenAutocompleteOption) => void;
  readonly onQueryChange?: (query: string) => void;
  readonly options: readonly TokenAutocompleteOption[];
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly selectedOptions?: readonly TokenAutocompleteOption[];
  readonly secondaryPlaceholder?: string;
  readonly statusMessage?: string;
  readonly valueNormalizer?: (value: string) => string;
  readonly values: readonly string[];
};

export function TokenAutocomplete({
  busy = false,
  className,
  disabled = false,
  error,
  hint,
  id: suppliedId,
  includeUnavailableValuesInFormValue = true,
  invalidSelectionMessage = "Choose a value from the suggestions.",
  invalidValueMessage = "Replace values that are no longer available.",
  label,
  name,
  onChange,
  onOptionSelected,
  onQueryChange,
  options,
  placeholder = "Add a value",
  required = false,
  selectedOptions: suppliedSelectedOptions = [],
  secondaryPlaceholder = "Add another value",
  statusMessage = "",
  valueNormalizer = normalise,
  values,
}: TokenAutocompleteProps) {
  const generatedId = useId();
  const inputId = suppliedId ?? generatedId;
  const listboxId = useId();
  const errorId = useId();
  const hintId = useId();
  const anchorRef = useRef<HTMLDivElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [selectionError, setSelectionError] = useState("");
  const availableOptions = useMemo(
    () => uniqueOptions([...options, ...suppliedSelectedOptions], valueNormalizer),
    [options, suppliedSelectedOptions, valueNormalizer],
  );
  const optionsByValue = useMemo(
    () => new Map(availableOptions.map((option) => [valueNormalizer(option.value), option])),
    [availableOptions, valueNormalizer],
  );
  const selectedOptions = values.flatMap((value) => {
    const option = optionsByValue.get(valueNormalizer(value));
    return option ? [option] : [];
  });
  const invalidValues = values.filter((value) => !optionsByValue.has(valueNormalizer(value)));
  const selectedValueSet = new Set(selectedOptions.map((option) => valueNormalizer(option.value)));
  const selectableOptions = availableOptions.filter(
    (option) => !selectedValueSet.has(valueNormalizer(option.value)),
  );
  const formValues = includeUnavailableValuesInFormValue
    ? values
    : selectedOptions.map((option) => option.value);
  const visibleError =
    selectionError || error || (invalidValues.length > 0 ? invalidValueMessage : undefined);
  const describedBy = [hint ? hintId : undefined, visibleError ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={["jr-token-autocomplete", className].filter(Boolean).join(" ")}>
      <label className="jr-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input name={name} type="hidden" value={formValues.join("\n")} readOnly />
      <Combobox.Root
        autoHighlight
        filter={(option, query) =>
          [option.label, ...(option.searchTerms ?? [])].some((term) =>
            valueNormalizer(term).includes(valueNormalizer(query)),
          )
        }
        isItemEqualToValue={(option, value) =>
          valueNormalizer(option.value) === valueNormalizer(value.value)
        }
        inputValue={inputValue}
        items={selectableOptions}
        itemToStringLabel={(option) => option.label}
        multiple
        onInputValueChange={(query) => {
          setInputValue(query);
          setOpen(true);
          onQueryChange?.(query);
          setSelectionError("");
        }}
        onValueChange={(nextOptions) => {
          const previous = new Set(selectedOptions.map((option) => valueNormalizer(option.value)));
          const added = nextOptions.find((option) => !previous.has(valueNormalizer(option.value)));
          if (added) {
            onOptionSelected?.(added);
          }
          onChange([...invalidValues, ...nextOptions.map((option) => option.value)]);
          setInputValue("");
          setOpen(false);
          setSelectionError("");
        }}
        onOpenChange={(nextOpen, details) => {
          const rejectsTypedValue =
            !nextOpen &&
            details.event instanceof KeyboardEvent &&
            details.event.key === "Enter" &&
            inputValue.trim() !== "" &&
            !optionsByValue.has(valueNormalizer(inputValue));
          if (rejectsTypedValue) {
            details.cancel();
            setSelectionError(invalidSelectionMessage);
            return;
          }
          setOpen(nextOpen);
        }}
        open={open}
        value={selectedOptions}
      >
        <div className="jr-token-autocomplete-anchor" ref={anchorRef}>
          <Combobox.InputGroup className="jr-token-autocomplete-input">
            <Combobox.Chips className="jr-token-autocomplete-chips">
              <Combobox.Value>
                {(currentOptions: TokenAutocompleteOption[]) => (
                  <>
                    {currentOptions.map((option) => (
                      <Combobox.Chip
                        aria-label={option.label}
                        className="jr-token-autocomplete-token"
                        key={option.value}
                      >
                        <span>{option.label}</span>
                        <Combobox.ChipRemove
                          aria-label={`Remove ${option.label}`}
                          className="jr-token-autocomplete-remove"
                          disabled={disabled}
                        >
                          <RemoveIcon />
                        </Combobox.ChipRemove>
                      </Combobox.Chip>
                    ))}
                    {invalidValues.map((value) => (
                      <span
                        className="jr-token-autocomplete-token"
                        data-invalid="true"
                        key={`invalid-${value}`}
                      >
                        <span>{value}</span>
                        <button
                          aria-label={`Remove ${value}`}
                          className="jr-token-autocomplete-remove"
                          disabled={disabled}
                          onClick={() => onChange(values.filter((current) => current !== value))}
                          type="button"
                        >
                          <RemoveIcon />
                        </button>
                      </span>
                    ))}
                    <Combobox.Input
                      aria-busy={busy || undefined}
                      aria-controls={listboxId}
                      aria-describedby={describedBy || undefined}
                      aria-invalid={visibleError ? "true" : undefined}
                      autoComplete="off"
                      disabled={disabled}
                      id={inputId}
                      onBlur={(event) => {
                        if (
                          inputValue.trim() !== "" &&
                          !optionsByValue.has(valueNormalizer(inputValue))
                        ) {
                          setSelectionError(invalidSelectionMessage);
                        }
                        const nextFocus = event.relatedTarget;
                        if (
                          !(nextFocus instanceof Node) ||
                          !anchorRef.current?.contains(nextFocus)
                        ) {
                          setOpen(false);
                        }
                      }}
                      onFocus={() => {
                        setOpen(true);
                        onQueryChange?.(inputValue);
                      }}
                      onPointerDown={() => {
                        setOpen(true);
                      }}
                      onKeyDown={(event) => {
                        if (
                          event.key === "Enter" &&
                          inputValue.trim() !== "" &&
                          !optionsByValue.has(valueNormalizer(inputValue))
                        ) {
                          event.preventDefault();
                          setSelectionError(invalidSelectionMessage);
                        }
                      }}
                      placeholder={values.length === 0 ? placeholder : secondaryPlaceholder}
                      required={required && values.length === 0}
                    />
                  </>
                )}
              </Combobox.Value>
            </Combobox.Chips>
          </Combobox.InputGroup>
          <div
            className="jr-token-autocomplete-options"
            hidden={!open || selectableOptions.length === 0}
          >
            <Combobox.List id={listboxId}>
              {(option: TokenAutocompleteOption) => (
                <Combobox.Item
                  className="jr-token-autocomplete-option"
                  key={option.value}
                  value={option}
                >
                  <span>{option.label}</span>
                  {option.detail ? <small>{option.detail}</small> : null}
                </Combobox.Item>
              )}
            </Combobox.List>
          </div>
        </div>
      </Combobox.Root>
      {hint ? (
        <small className="jr-field-hint" id={hintId}>
          {hint}
        </small>
      ) : null}
      {visibleError ? (
        <small className="jr-field-error" id={errorId}>
          {visibleError}
        </small>
      ) : null}
      <p className="jr-token-autocomplete-announcement" role="status">
        {statusMessage}
      </p>
    </div>
  );
}

function RemoveIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

function uniqueOptions(
  options: readonly TokenAutocompleteOption[],
  normalizer: (value: string) => string,
): readonly TokenAutocompleteOption[] {
  return [...new Map(options.map((option) => [normalizer(option.value), option])).values()];
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase();
}
