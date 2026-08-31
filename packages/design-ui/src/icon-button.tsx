import type { ButtonHTMLAttributes, ReactNode } from "react";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label" | "aria-pressed"> {
  readonly busy?: boolean;
  readonly children: ReactNode;
  readonly label: string;
  readonly pressed?: boolean;
  readonly variant?: "ghost" | "outlined";
}

export function IconButton({
  busy = false,
  children,
  className,
  disabled,
  label,
  pressed,
  type = "button",
  variant = "ghost",
  ...buttonProps
}: IconButtonProps) {
  return (
    <button
      {...buttonProps}
      aria-busy={busy || undefined}
      aria-label={label}
      aria-pressed={pressed}
      className={["jr-icon-button", className].filter(Boolean).join(" ")}
      data-variant={variant}
      disabled={disabled || busy}
      type={type}
    >
      {children}
    </button>
  );
}
