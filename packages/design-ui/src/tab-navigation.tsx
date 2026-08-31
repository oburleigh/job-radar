import type { ReactNode } from "react";

export interface TabNavigationProps {
  readonly children: ReactNode;
  readonly label: string;
  readonly level?: "primary" | "secondary";
}

export function TabNavigation({ children, label, level = "primary" }: TabNavigationProps) {
  return (
    <nav aria-label={label} className="jr-tab-navigation" data-level={level}>
      {children}
    </nav>
  );
}
