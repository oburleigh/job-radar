export interface NotificationBadgeProps {
  readonly count: number;
}

export function NotificationBadge({ count }: NotificationBadgeProps) {
  if (!Number.isSafeInteger(count) || count <= 0) {
    return null;
  }

  return (
    <span className="jr-notification-badge" aria-hidden="true">
      {count}
    </span>
  );
}
