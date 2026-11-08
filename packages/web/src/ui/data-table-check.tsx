import type { MouseEvent } from "react";
import { Checkbox } from "./checkbox";
import { Tooltip } from "./tooltip";

type CheckState = boolean | "indeterminate";

// The padding lifts the 16px box to the 24px pointer floor. Out of the Tab
// order: the grid is one Tab stop.
function HitArea({ children }: { children: React.ReactNode }) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the Radix Checkbox is a button, and a label activates the button it wraps
    <label className="-m-1 flex w-fit cursor-pointer p-1">{children}</label>
  );
}

/** A row's checkbox; a blocked one stays focusable, unticked, its tooltip stating why. */
export function RowCheck({
  label,
  checked,
  blocked,
  onToggle,
}: {
  label: string;
  checked: boolean;
  /** Why it cannot be ticked; null: it can. */
  blocked: string | null;
  onToggle: (shift: boolean) => void;
}) {
  if (blocked !== null) {
    return (
      <HitArea>
        <Tooltip label={label} detail={blocked}>
          <Checkbox
            tabIndex={-1}
            checked={false}
            aria-disabled="true"
            aria-label={label}
            className="cursor-not-allowed opacity-50"
            onClick={(event: MouseEvent) => event.preventDefault()}
          />
        </Tooltip>
      </HitArea>
    );
  }
  return (
    <HitArea>
      <Checkbox
        tabIndex={-1}
        checked={checked}
        onClick={(event) => {
          // Radix toggles on click; the row's state is the caller's, so the
          // click is taken here.
          event.preventDefault();
          onToggle(event.shiftKey);
        }}
        aria-label={label}
      />
    </HitArea>
  );
}

/** A header's checkbox that picks every row it covers. */
export function AllCheck({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: CheckState;
  disabled: boolean;
  onChange: () => void;
}) {
  return (
    <HitArea>
      <Checkbox
        tabIndex={-1}
        disabled={disabled}
        checked={checked}
        onCheckedChange={onChange}
        aria-label={label}
      />
    </HitArea>
  );
}

export const checkState = (chosen: number, of: number): CheckState =>
  of > 0 && chosen === of ? true : chosen > 0 ? "indeterminate" : false;
