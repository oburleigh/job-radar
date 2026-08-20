import type { CSSProperties } from "react";

export interface SkeletonProps {
  readonly className?: string;
  readonly height?: string;
  readonly width?: string;
}

export function Skeleton({ className, height = "1rem", width = "100%" }: SkeletonProps) {
  const style: CSSProperties = { height, width };
  const classes = ["jr-skeleton", className].filter(Boolean).join(" ");

  return <span aria-hidden="true" className={classes} style={style} />;
}
