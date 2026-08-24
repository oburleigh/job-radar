import { IconButton } from "@job-radar/design-ui";
import { X } from "lucide-react";
import { useId, useMemo, useRef, useState } from "react";

import { type CountryCurrencyOption, countryOptionsMatching } from "./country-currency-catalogue";

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
  const suggestions = useMemo(
    () => (hasInteracted ? countryOptionsMatching(inputValue).slice(0, 8) : []),
    [hasInteracted, inputValue],
  );
  const isPopupVisible = open && suggestions.length > 0;
  const activeOption = isPopupVisible && activeIndex >= 0 ? suggestions[activeIndex] : undefined;

  function addLocation(value: string, country?: CountryCurrencyOption) {
    const location = value.trim();
    if (location === "") {
      return;
    }
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
    if (country) {
      onCountrySelected?.(country);
    }
    setInputValue("");
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

  function addActiveOrTypedValue() {
    if (activeOption) {
      addLocation(activeOption.countryName, activeOption);
      return;
    }
    addLocation(inputValue);
  }

  return (
    <div className="form-field token-combobox">
      <label htmlFor={inputId}>
        <span>Target locations</span>
      </label>
      <input name={name} type="hidden" value={values.join("\n")} readOnly />
      <div className="token-combobox-input">
        {values.map((location) => (
          <span className="location-token" key={location}>
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
          aria-describedby={error ? errorId : undefined}
          aria-expanded={isPopupVisible}
          aria-invalid={Boolean(error)}
          aria-autocomplete="list"
          autoComplete="off"
          id={inputId}
          onBlur={() => setOpen(false)}
          onChange={(event) => {
            setHasInteracted(true);
            setInputValue(event.target.value);
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
              addActiveOrTypedValue();
            } else if (event.key === "Tab" && activeOption) {
              event.preventDefault();
              addActiveOrTypedValue();
              queueMicrotask(() => focusNextControl(inputRef.current));
            } else if (event.key === "Escape") {
              setOpen(false);
            } else if (event.key === "Backspace" && inputValue === "" && values.length > 0) {
              removeLocation(values.at(-1) ?? "");
            }
          }}
          placeholder={
            values.length === 0 ? "Dubai or United Arab Emirates" : "Add another location"
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
                  addLocation(option.countryName, option);
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
      {error ? (
        <p className="field-error" id={errorId}>
          {error}
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
