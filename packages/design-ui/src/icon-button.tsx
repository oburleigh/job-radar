import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed"> {
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly label: string;
  readonly pressed?: boolean;
}

export function IconButton({
  busy = false,
  children,
  className,
  disabled,
  label,
  pressed,
  type = "button",
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-busy={busy || undefined}
      aria-label={label}
      aria-pressed={pressed}
      className={["jr-icon-button", className].filter(Boolean).join(" ")}
      disabled={disabled || busy}
      type={type}
    >
      {children}
    </button>
  );
}
