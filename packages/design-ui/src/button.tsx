import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly variant?: ButtonVariant;
}

export function buttonAttributes(variant: ButtonVariant = "secondary", className?: string) {
  return {
    className: ["jr-button", className].filter(Boolean).join(" "),
    "data-variant": variant,
  } as const;
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
  const presentation = buttonAttributes(variant, className);

  return (
    <button
      {...buttonProps}
      {...presentation}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      type={type}
    >
      {children}
    </button>
  );
}
