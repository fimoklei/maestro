import type { ComponentPropsWithRef, ReactNode } from "react";
import { Button } from "./button";
import type { CauseText } from "./gated-button";
import { Tooltip } from "./tooltip";

export interface IconButtonProps
  extends Omit<ComponentPropsWithRef<"button">, "children"> {
  /** The action, e.g. "Re-read Skills". */
  label: string;
  /**
   * Why the control cannot be used: five words or fewer, or the text that
   * says it, which keeps the plain label as its name.
   */
  unavailable?: string | CauseText;
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
  "aria-describedby": describedBy,
  ...rest
}: IconButtonProps) {
  // aria-disabled, never `disabled`: an unavailable control keeps its Tab stop.
  const blocked = unavailable !== undefined && unavailable !== "";
  const name =
    typeof unavailable === "string" && blocked
      ? `${label} — ${unavailable}`
      : label;

  return (
    <Tooltip label={name}>
      <Button
        size="icon"
        variant={variant}
        aria-label={name}
        busy={busy}
        aria-disabled={blocked ? true : undefined}
        aria-describedby={
          typeof unavailable === "object"
            ? unavailable.describedBy
            : describedBy
        }
        onClick={blocked ? undefined : onClick}
        {...rest}
      >
        {busy ? null : children}
      </Button>
    </Tooltip>
  );
}
