import { Tooltip as BaseTooltip } from "@base-ui/react/tooltip";
import type { ReactElement } from "react";

export interface TooltipProps {
  readonly children: ReactElement;
  readonly label: string;
}

export function Tooltip({ children, label }: TooltipProps) {
  return (
    <BaseTooltip.Root>
      <BaseTooltip.Trigger aria-label={label} render={children} />
      <BaseTooltip.Portal>
        <BaseTooltip.Positioner className="jr-tooltip-positioner" sideOffset={8}>
          <BaseTooltip.Popup className="jr-tooltip-popup" role="tooltip">
            <BaseTooltip.Arrow className="jr-tooltip-arrow" />
            {label}
          </BaseTooltip.Popup>
        </BaseTooltip.Positioner>
      </BaseTooltip.Portal>
    </BaseTooltip.Root>
  );
}
