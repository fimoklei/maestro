import { Button, type ButtonProps } from "./button";
import { Tooltip } from "./tooltip";

/** The id of visible text on the page that states why a control is blocked. */
export type CauseText = { describedBy: string };

/**
 * An action that may be unavailable, kept focusable and running nothing. A
 * written cause names it `{label} — {cause}`; a `CauseText` keeps the plain
 * label and describes it by that text. One element either way, so focus stays
 * put.
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
  /** Why it cannot run now: five words or fewer, or the text that says it; null when it can. */
  unavailable: string | CauseText | null;
}) {
  const name =
    typeof unavailable === "string" ? `${label} — ${unavailable}` : label;
  return (
    <Tooltip label={name}>
      <Button
        {...rest}
        blocked={unavailable !== null}
        aria-label={name}
        aria-describedby={
          unavailable === null || typeof unavailable === "string"
            ? undefined
            : unavailable.describedBy
        }
      >
        {label}
      </Button>
    </Tooltip>
  );
}
