import { useEffect, useId, useMemo, useRef, useState } from "react";

import { IconButton } from "./icon-button.js";

export type TokenAutocompleteOption = {
  readonly detail?: string;
  readonly label: string;
  readonly value: string;
};

export type TokenAutocompleteProps = {
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
  readonly options: readonly TokenAutocompleteOption[];
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly secondaryPlaceholder?: string;
  readonly valueNormalizer?: (value: string) => string;
  readonly values: readonly string[];
};

export function TokenAutocomplete({
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
  options,
  placeholder = "Add a value",
  required = false,
  secondaryPlaceholder = "Add another value",
  valueNormalizer = normalise,
  values,
}: TokenAutocompleteProps) {
  const generatedId = useId();
  const inputId = suppliedId ?? generatedId;
  const listboxId = useId();
  const errorId = useId();
  const hintId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const optionsByValue = useMemo(
    () => new Map(options.map((option) => [valueNormalizer(option.value), option])),
    [options, valueNormalizer],
  );
  const selectedOptions = withUniqueTokenKeys(
    "selected",
    values.flatMap((value) => {
      const option = optionsByValue.get(valueNormalizer(value));
      return option ? [{ keyValue: option.value, option, value }] : [];
    }),
  );
  const invalidValues = withUniqueTokenKeys(
    "invalid",
    values
      .filter((value) => !optionsByValue.has(valueNormalizer(value)))
      .map((value) => ({ keyValue: value, value })),
  );
  const formValues = includeUnavailableValuesInFormValue
    ? values
    : selectedOptions.map(({ value }) => value);
  const suggestions = useMemo(() => {
    if (!hasInteracted) {
      return [];
    }
    const query = valueNormalizer(inputValue);
    return options.filter(
      (option) => query === "" || valueNormalizer(option.label).includes(query),
    );
  }, [hasInteracted, inputValue, options, valueNormalizer]);
  const isPopupVisible = open && suggestions.length > 0;
  const activeOption = isPopupVisible && activeIndex >= 0 ? suggestions[activeIndex] : undefined;
  const visibleError =
    selectionError || error || (invalidValues.length > 0 ? invalidValueMessage : undefined);
  const describedBy = [hint ? hintId : undefined, visibleError ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  useEffect(() => {
    if (!isPopupVisible || activeIndex < 0) {
      return;
    }
    document
      .getElementById(`${listboxId}-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, isPopupVisible, listboxId]);

  function addOption(option: TokenAutocompleteOption) {
    onOptionSelected?.(option);
    if (values.some((value) => valueNormalizer(value) === valueNormalizer(option.value))) {
      setAnnouncement(`${option.label} is already included.`);
    } else {
      onChange([...values, option.value]);
      setAnnouncement(`${option.label} added.`);
    }
    setInputValue("");
    setSelectionError("");
    setActiveIndex(-1);
    setOpen(false);
  }

  function removeValue(value: string) {
    const option = optionsByValue.get(valueNormalizer(value));
    onChange(values.filter((current) => current !== value));
    setAnnouncement(`${option?.label ?? value} removed.`);
  }

  function moveActive(direction: 1 | -1) {
    setHasInteracted(true);
    setOpen(true);
    if (suggestions.length === 0) {
      return;
    }
    setActiveIndex((current) => {
      if (current < 0) {
        return direction === 1 ? 0 : suggestions.length - 1;
      }
      return (current + direction + suggestions.length) % suggestions.length;
    });
  }

  function selectInput(): boolean {
    const option = activeOption ?? optionsByValue.get(valueNormalizer(inputValue));
    if (option) {
      addOption(option);
      return true;
    }
    if (inputValue.trim() !== "") {
      const message = invalidSelectionMessage;
      setSelectionError(message);
      setAnnouncement(message);
    }
    return false;
  }

  return (
    <div className={["jr-token-autocomplete", className].filter(Boolean).join(" ")}>
      <label className="jr-field-label" htmlFor={inputId}>
        {label}
      </label>
      <input name={name} type="hidden" value={formValues.join("\n")} readOnly />
      <div className="jr-token-autocomplete-input">
        {selectedOptions.map(({ key, option, value }) => (
          <Token
            key={key}
            label={option.label}
            onRemove={() => removeValue(value)}
            disabled={disabled}
          />
        ))}
        {invalidValues.map(({ key, value }) => (
          <Token
            key={key}
            label={value}
            onRemove={() => removeValue(value)}
            invalid
            disabled={disabled}
          />
        ))}
        <input
          aria-activedescendant={activeOption ? `${listboxId}-${activeIndex}` : undefined}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-describedby={describedBy || undefined}
          aria-expanded={isPopupVisible}
          aria-invalid={visibleError ? true : undefined}
          autoComplete="off"
          disabled={disabled}
          id={inputId}
          onBlur={() => {
            if (inputValue.trim() !== "" && !optionsByValue.has(valueNormalizer(inputValue))) {
              setSelectionError(invalidSelectionMessage);
            }
            setActiveIndex(-1);
            setOpen(false);
          }}
          onChange={(event) => {
            setHasInteracted(true);
            setInputValue(event.target.value);
            setSelectionError("");
            setActiveIndex(-1);
            setOpen(true);
          }}
          onFocus={() => {
            setHasInteracted(true);
            setOpen(true);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              moveActive(1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              moveActive(-1);
            } else if (event.key === "Enter") {
              event.preventDefault();
              selectInput();
            } else if (event.key === "Tab") {
              const option = activeOption ?? optionsByValue.get(valueNormalizer(inputValue));
              if (option) {
                event.preventDefault();
                addOption(option);
                queueMicrotask(() => focusNextControl(inputRef.current));
              } else if (inputValue.trim() !== "") {
                selectInput();
              }
            } else if (event.key === "Escape") {
              setActiveIndex(-1);
              setOpen(false);
            } else if (event.key === "Backspace" && inputValue === "" && values.length > 0) {
              removeValue(values.at(-1) ?? "");
            }
          }}
          placeholder={values.length === 0 ? placeholder : secondaryPlaceholder}
          ref={inputRef}
          required={required && values.length === 0}
          role="combobox"
          value={inputValue}
        />
      </div>
      <div
        className="jr-token-autocomplete-options"
        hidden={!isPopupVisible}
        id={listboxId}
        role="listbox"
      >
        {isPopupVisible
          ? suggestions.map((option, index) => (
              <div
                aria-selected={index === activeIndex}
                id={`${listboxId}-${index}`}
                key={option.value}
                onMouseDown={(event) => {
                  event.preventDefault();
                  addOption(option);
                }}
                role="option"
                tabIndex={-1}
              >
                <span>{option.label}</span>
                {option.detail ? <small>{option.detail}</small> : null}
              </div>
            ))
          : null}
      </div>
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
        {announcement}
      </p>
    </div>
  );
}

function Token({
  disabled,
  invalid = false,
  label,
  onRemove,
}: {
  readonly disabled: boolean;
  readonly invalid?: boolean;
  readonly label: string;
  readonly onRemove: () => void;
}) {
  return (
    <span className="jr-token-autocomplete-token" data-invalid={invalid || undefined}>
      <span>{label}</span>
      <IconButton
        className="jr-token-autocomplete-remove"
        disabled={disabled}
        label={`Remove ${label}`}
        onClick={onRemove}
        onMouseDown={(event) => event.preventDefault()}
      >
        <svg aria-hidden="true" viewBox="0 0 16 16">
          <path d="m4 4 8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2" />
        </svg>
      </IconButton>
    </span>
  );
}

function focusNextControl(current: HTMLInputElement | null) {
  const form = current?.form;
  if (!current || !form) {
    return;
  }
  const controls = Array.from(form.elements).filter(
    (element): element is HTMLElement =>
      element instanceof HTMLElement &&
      !element.hasAttribute("disabled") &&
      element.tabIndex >= 0 &&
      element.getAttribute("type") !== "hidden",
  );
  controls[controls.indexOf(current) + 1]?.focus();
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase();
}

function withUniqueTokenKeys<T extends { readonly keyValue: string }>(
  prefix: string,
  tokens: readonly T[],
): readonly (T & { readonly key: string })[] {
  const occurrences = new Map<string, number>();
  return tokens.map((token) => {
    const occurrence = occurrences.get(token.keyValue) ?? 0;
    occurrences.set(token.keyValue, occurrence + 1);
    return { ...token, key: `${prefix}-${token.keyValue}-${occurrence}` };
  });
}
