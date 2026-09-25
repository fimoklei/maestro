import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Button } from "./button";
import { Tooltip } from "./tooltip";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "children"> {
  /** The action, e.g. "Re-read Inventory". */
  label: string;
  /** Why the control cannot be used, in five words or fewer. */
  unavailable?: string;
  variant?: "primary" | "quiet" | "ghost" | "danger";
  /** A write or re-read is running: the spinner stands in for the icon. */
  busy?: boolean;
  children: ReactNode;
}

export function IconButton({
  label,
  unavailable,
  variant = "quiet",
  busy = false,
  onClick,
  children,
  ...rest
}: IconButtonProps) {
  // aria-disabled, never `disabled`: an unavailable control keeps its Tab stop.
  const name = unavailable ? `${label} — ${unavailable}` : label;

  return (
    <Tooltip label={name}>
      <Button
        size="icon"
        variant={variant}
        aria-label={name}
        busy={busy}
        aria-disabled={unavailable ? true : undefined}
        onClick={unavailable ? undefined : onClick}
        {...rest}
      >
        {busy ? null : children}
      </Button>
    </Tooltip>
  );
}
