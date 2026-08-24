import { IconButton } from "@job-radar/design-ui";
import { X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import {
  type CountryCurrencyOption,
  countryOptionFor,
  countryOptionsMatching,
} from "./country-currency-catalogue";

interface LocationComboboxProps {
  readonly error?: string | undefined;
  readonly name: string;
  readonly onCountrySelected?: ((option: CountryCurrencyOption) => void) | undefined;
  readonly values: readonly string[];
  readonly onChange: (values: readonly string[]) => void;
}

export function LocationCombobox({
  error,
  name,
  onChange,
  onCountrySelected,
  values,
}: LocationComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState("");
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const [selectionError, setSelectionError] = useState("");
  const suggestions = useMemo(
    () => (hasInteracted ? countryOptionsMatching(inputValue) : []),
    [hasInteracted, inputValue],
  );
  const isPopupVisible = open && suggestions.length > 0;
  const activeOption = isPopupVisible && activeIndex >= 0 ? suggestions[activeIndex] : undefined;
  const selectedCountries = values.flatMap((value) => {
    const option = countryOptionFor(value);
    return option ? [{ option, value }] : [];
  });
  const legacyValues = values.filter((value) => countryOptionFor(value) === undefined);
  const legacyError =
    legacyValues.length > 0
      ? "Replace saved target locations that are not in the location catalogue."
      : undefined;
  const visibleError = selectionError || error || legacyError;

  useEffect(() => {
    if (!isPopupVisible || activeIndex < 0) {
      return;
    }
    document
      .getElementById(`${listboxId}-${activeIndex}`)
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [activeIndex, isPopupVisible, listboxId]);

  function addCountry(country: CountryCurrencyOption) {
    const location = country.countryName;
    if (
      values.some(
        (existing) => existing.localeCompare(location, undefined, { sensitivity: "accent" }) === 0,
      )
    ) {
      setAnnouncement(`${location} is already included.`);
    } else {
      onChange([...values, location]);
      setAnnouncement(`${location} added.`);
    }
    onCountrySelected?.(country);
    setInputValue("");
    setSelectionError("");
    setActiveIndex(-1);
    setOpen(false);
  }

  function removeLocation(value: string) {
    onChange(values.filter((location) => location !== value));
    setAnnouncement(`${value} removed.`);
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

  function resolveInput(): CountryCurrencyOption | undefined {
    return activeOption ?? countryOptionFor(inputValue);
  }

  function addSelectedCountry(): boolean {
    const country = resolveInput();
    if (country) {
      addCountry(country);
      return true;
    }
    if (inputValue.trim() !== "") {
      const message = "Choose a target location from the suggestions.";
      setSelectionError(message);
      setAnnouncement(message);
    }
    return false;
  }

  return (
    <div className="form-field token-combobox">
      <label htmlFor={inputId}>
        <span>Target locations</span>
      </label>
      <input
        name={name}
        type="hidden"
        value={selectedCountries.map(({ option }) => option.countryName).join("\n")}
        readOnly
      />
      {legacyValues.length > 0 ? (
        <input name="legacyLocationTerms" type="hidden" value={legacyValues.join("\n")} readOnly />
      ) : null}
      <div className="token-combobox-input">
        {selectedCountries.map(({ option, value }) => (
          <span className="location-token" key={value}>
            <span className="location-token-label">{option.countryName}</span>
            <IconButton
              className="location-token-remove"
              label={`Remove ${option.countryName}`}
              onClick={() => removeLocation(value)}
              onMouseDown={(event) => event.preventDefault()}
            >
              <X aria-hidden="true" size={15} strokeWidth={2.25} />
            </IconButton>
          </span>
        ))}
        {legacyValues.map((location) => (
          <span className="location-token location-token-invalid" key={location}>
            <span className="location-token-label">{location}</span>
            <IconButton
              className="location-token-remove"
              label={`Remove ${location}`}
              onClick={() => removeLocation(location)}
              onMouseDown={(event) => event.preventDefault()}
            >
              <X aria-hidden="true" size={15} strokeWidth={2.25} />
            </IconButton>
          </span>
        ))}
        <input
          aria-activedescendant={activeOption ? `${listboxId}-${activeIndex}` : undefined}
          aria-controls={listboxId}
          aria-describedby={visibleError ? errorId : undefined}
          aria-expanded={isPopupVisible}
          aria-invalid={Boolean(visibleError)}
          aria-autocomplete="list"
          autoComplete="off"
          id={inputId}
          onBlur={() => {
            if (inputValue.trim() !== "" && countryOptionFor(inputValue) === undefined) {
              setSelectionError("Choose a target location from the suggestions.");
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
              addSelectedCountry();
            } else if (event.key === "Tab") {
              const country = resolveInput();
              if (country) {
                event.preventDefault();
                addCountry(country);
                queueMicrotask(() => focusNextControl(inputRef.current));
              } else if (inputValue.trim() !== "") {
                addSelectedCountry();
              }
            } else if (event.key === "Escape") {
              setActiveIndex(-1);
              setOpen(false);
            } else if (event.key === "Backspace" && inputValue === "" && values.length > 0) {
              removeLocation(values.at(-1) ?? "");
            }
          }}
          placeholder={
            values.length === 0 ? "United Arab Emirates or China" : "Add another location"
          }
          ref={inputRef}
          role="combobox"
          value={inputValue}
        />
      </div>
      <div className="combobox-options" hidden={!isPopupVisible} id={listboxId} role="listbox">
        {isPopupVisible
          ? suggestions.map((option, index) => (
              <div
                aria-selected={index === activeIndex}
                id={`${listboxId}-${index}`}
                key={option.countryCode}
                onMouseDown={(event) => {
                  event.preventDefault();
                  addCountry(option);
                }}
                role="option"
                tabIndex={-1}
              >
                <span>{option.countryName}</span>
                <small>{option.currencyCode}</small>
              </div>
            ))
          : null}
      </div>
      {visibleError ? (
        <p className="field-error" id={errorId}>
          {visibleError}
        </p>
      ) : null}
      <p className="sr-only" role="status">
        {announcement}
      </p>
    </div>
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
  const next = controls[controls.indexOf(current) + 1];
  next?.focus();
}
