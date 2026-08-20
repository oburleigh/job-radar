import type { ButtonHTMLAttributes } from "react";

export interface SwitchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-checked" | "role"> {
  readonly checked: boolean;
  readonly label: string;
  readonly onCheckedChange?: (checked: boolean) => void;
}

export function Switch({
  checked,
  className,
  label,
  onCheckedChange,
  onClick,
  type = "button",
  ...buttonProps
}: SwitchProps) {
  const classes = ["jr-switch", className].filter(Boolean).join(" ");

  return (
    <button
      {...buttonProps}
      aria-checked={checked}
      aria-label={label}
      className={classes}
      data-state={checked ? "checked" : "unchecked"}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) {
          onCheckedChange?.(!checked);
        }
      }}
      role="switch"
      type={type}
    >
      <span aria-hidden="true" />
    </button>
  );
}
