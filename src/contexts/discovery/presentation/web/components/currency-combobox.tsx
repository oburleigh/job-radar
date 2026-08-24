import { useEffect, useId, useMemo, useState } from "react";

import { type CurrencyOption, currencyOptionsMatching } from "./country-currency-catalogue";

interface CurrencyComboboxProps {
  readonly error?: string | undefined;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly value: string;
}

export function CurrencyCombobox({ error, name, onChange, value }: CurrencyComboboxProps) {
  const inputId = useId();
  const listboxId = useId();
  const errorId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [announcement, setAnnouncement] = useState("");
  const suggestions = useMemo(
    () => (hasInteracted ? currencyOptionsMatching(query).slice(0, 8) : []),
    [hasInteracted, query],
  );
  const isPopupVisible = open && suggestions.length > 0;
  const activeOption = isPopupVisible && activeIndex >= 0 ? suggestions[activeIndex] : undefined;

  useEffect(() => {
    setQuery(value);
  }, [value]);

  function selectCurrency(option: CurrencyOption) {
    onChange(option.currencyCode);
    setQuery(option.currencyCode);
    setAnnouncement(
      option.countryNames[0]
        ? `${option.currencyCode} selected for ${option.countryNames[0]}.`
        : `${option.currencyCode} selected.`,
    );
    setActiveIndex(-1);
    setOpen(false);
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

  return (
    <div className="form-field currency-combobox">
      <label htmlFor={inputId}>
        <span>Salary currency</span>
      </label>
      <input name={name} type="hidden" value={value} readOnly />
      <input
        aria-activedescendant={activeOption ? `${listboxId}-${activeIndex}` : undefined}
        aria-controls={listboxId}
        aria-describedby={error ? errorId : undefined}
        aria-expanded={isPopupVisible}
        aria-invalid={Boolean(error)}
        aria-autocomplete="list"
        autoComplete="off"
        id={inputId}
        onBlur={() => {
          setQuery(value);
          setOpen(false);
        }}
        onChange={(event) => {
          setHasInteracted(true);
          setQuery(event.target.value);
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
          } else if ((event.key === "Enter" || event.key === "Tab") && activeOption) {
            if (event.key === "Enter") {
              event.preventDefault();
            }
            selectCurrency(activeOption);
          } else if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search code, currency, or country"
        role="combobox"
        value={query}
      />
      <div className="combobox-options" hidden={!isPopupVisible} id={listboxId} role="listbox">
        {isPopupVisible
          ? suggestions.map((option, index) => (
              <div
                aria-selected={index === activeIndex}
                id={`${listboxId}-${index}`}
                key={option.currencyCode}
                onMouseDown={(event) => {
                  event.preventDefault();
                  selectCurrency(option);
                }}
                role="option"
                tabIndex={-1}
              >
                <span>
                  <strong>{option.currencyCode}</strong> {option.currencyName}
                </span>
                {option.countryNames[0] ? <small>{option.countryNames[0]}</small> : null}
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
