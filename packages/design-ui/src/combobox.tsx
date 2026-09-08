import { Combobox as BaseCombobox } from "@base-ui/react/combobox";
import { useMemo, useState } from "react";

export type ComboboxOption = {
  readonly detail?: string;
  readonly label: string;
  readonly searchTerms?: readonly string[];
  readonly value: string;
};

export type ComboboxProps = {
  readonly className?: string;
  readonly disabled?: boolean;
  readonly error?: string;
  readonly hint?: string;
  readonly id: string;
  readonly label: string;
  readonly name: string;
  readonly onChange: (value: string) => void;
  readonly onOptionSelected?: (option: ComboboxOption) => void;
  readonly options: readonly ComboboxOption[];
  readonly placeholder?: string;
  readonly required?: boolean;
  readonly value: string;
};

/**
 * One value chosen from a filtered list. The multi-value sibling is TokenAutocomplete; both sit on
 * the same accessible primitive so the keyboard contract is not written twice.
 */
export function Combobox({
  className,
  disabled = false,
  error,
  hint,
  id,
  label,
  name,
  onChange,
  onOptionSelected,
  options,
  placeholder,
  required = false,
  value,
}: ComboboxProps) {
  const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = useMemo(
    () => options.find((option) => normalise(option.value) === normalise(value)) ?? null,
    [options, value],
  );
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const listboxId = `${id}-listbox`;
  const describedBy = [hint ? hintId : undefined, error ? errorId : undefined]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setPortalContainer}
      className={["jr-field", "jr-combobox", className].filter(Boolean).join(" ")}
    >
      <label className="jr-field-label" htmlFor={id}>
        {label}
        {required ? " (required)" : ""}
      </label>
      <input name={name} type="hidden" value={value} readOnly />
      <BaseCombobox.Root
        disabled={disabled}
        filter={(option: ComboboxOption, search: string) =>
          [option.label, option.value, ...(option.searchTerms ?? [])].some((term) =>
            normalise(term).includes(normalise(search)),
          )
        }
        inputValue={open ? query : (selected?.label ?? value)}
        isItemEqualToValue={(option: ComboboxOption, candidate: ComboboxOption) =>
          normalise(option.value) === normalise(candidate.value)
        }
        items={open ? options : []}
        itemToStringLabel={(option: ComboboxOption) => option.label}
        onInputValueChange={(next: string) => {
          setQuery(next);
          setOpen(true);
        }}
        onOpenChange={(next: boolean) => {
          setOpen(next);
          if (!next) setQuery("");
        }}
        onValueChange={(next: ComboboxOption | null) => {
          if (next) {
            onChange(next.value);
            onOptionSelected?.(next);
          }
          setOpen(false);
          setQuery("");
        }}
        open={open}
        value={selected}
      >
        <BaseCombobox.Input
          onBlur={() => {
            setOpen(false);
            setQuery("");
          }}
          onClick={() => {
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
          }}
          aria-controls={listboxId}
          aria-describedby={describedBy || undefined}
          aria-invalid={error ? "true" : undefined}
          autoComplete="off"
          className="jr-combobox-input"
          disabled={disabled}
          id={id}
          placeholder={placeholder}
          required={required}
        />
        <BaseCombobox.Portal container={portalContainer} keepMounted>
          <BaseCombobox.Positioner className="jr-combobox-positioner">
            <BaseCombobox.Popup className="jr-combobox-options">
              <BaseCombobox.List className="jr-combobox-list" id={listboxId}>
                {(option: ComboboxOption) => (
                  <BaseCombobox.Item
                    className="jr-combobox-option"
                    key={option.value}
                    value={option}
                  >
                    <span>{option.label}</span>
                    {option.detail ? <small>{option.detail}</small> : null}
                  </BaseCombobox.Item>
                )}
              </BaseCombobox.List>
            </BaseCombobox.Popup>
          </BaseCombobox.Positioner>
        </BaseCombobox.Portal>
      </BaseCombobox.Root>
      {hint ? (
        <small className="jr-field-hint" id={hintId}>
          {hint}
        </small>
      ) : null}
      {error ? (
        <small className="jr-field-error" id={errorId}>
          {error}
        </small>
      ) : null}
    </div>
  );
}

function normalise(value: string): string {
  return value.trim().toLocaleLowerCase();
}
