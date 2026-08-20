import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly variant?: "primary" | "secondary" | "danger";
}

export function Button({
  busy = false,
  children,
  className,
  disabled,
  type = "button",
  variant = "secondary",
  ...buttonProps
}: ButtonProps) {
  const classes = ["jr-button", `jr-button-${variant}`, className].filter(Boolean).join(" ");

  return (
    <button
      {...buttonProps}
      aria-busy={busy || undefined}
      className={classes}
      disabled={disabled || busy}
      type={type}
    >
      {children}
    </button>
  );
}
