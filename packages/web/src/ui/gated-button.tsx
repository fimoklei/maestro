import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

/**
 * An action that may be unavailable, kept focusable and running nothing. It
 * keeps its plain label; its tooltip states why, which describes it. One
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
  /** The sentence that says why it cannot run now; null when it can. */
  unavailable: string | null;
}) {
  return (
    <Tooltip label={label} detail={unavailable ?? undefined}>
      <Button {...rest} blocked={unavailable !== null} aria-label={label}>
        {label}
      </Button>
    </Tooltip>
  );
}
