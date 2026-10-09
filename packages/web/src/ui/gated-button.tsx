import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

/**
 * An action that may be unavailable: then named `{label} — {cause}`, kept
 * focusable and running nothing. One element either way, so focus stays put.
 */
export function GatedButton({
  label,
  unavailable,
  ...rest
}: Omit<ButtonProps, "children" | "blocked" | "busy" | "aria-label"> & {
  label: string;
  /** Why it cannot run now, in five words or fewer; null when it can. */
  unavailable: string | null;
}) {
  const name = unavailable === null ? label : `${label} — ${unavailable}`;
  return (
    <Tooltip label={name}>
      <Button {...rest} blocked={unavailable !== null} aria-label={name}>
        {label}
      </Button>
    </Tooltip>
  );
}
