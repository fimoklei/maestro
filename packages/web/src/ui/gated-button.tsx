import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

/** The id of visible text on the page that states why a control is blocked. */
export type CauseText = { describedBy: string };

/**
 * An action that may be unavailable, kept focusable and running nothing. It
 * keeps its plain label and is described by the text that states why. One
 * element whether blocked or not, so focus stays put.
 */
export function GatedButton({
  label,
  unavailable,
  ...rest
}: Omit<
  ButtonProps,
  "children" | "blocked" | "busy" | "aria-label" | "aria-describedby"
> & {
  label: string;
  /** The text that says why it cannot run now; null when it can. */
  unavailable: CauseText | null;
}) {
  return (
    <Tooltip label={label}>
      <Button
        {...rest}
        blocked={unavailable !== null}
        aria-label={label}
        aria-describedby={unavailable?.describedBy}
      >
        {label}
      </Button>
    </Tooltip>
  );
}
