import type { Ref } from "react";
import { ActionsMenu, type ActionsMenuItem } from "./actions-menu";
import { ACTIONS, type ActionKey } from "./busy-copy";
import { Button } from "./button";
import { GatedButton } from "./gated-button";
import { rowActionsLabel } from "./row-menu-copy";

// The pane's primary and its edit item as buttons; every other ⋮ item sits
// behind one ⋯ at the foot's right end, so the foot fits one line (#1485,
// #1744).
export type FootItem = ActionsMenuItem & {
  /** The accessible name where the label alone would not say what it acts on. */
  name?: string;
  /** The next step its state names, which ranks it for the pane's primary. */
  step?: "update" | "import";
  /** It edits the row's own content: a button beside the primary. */
  edit?: true;
  /** Its write is running: picks the busy label from `busy-copy`. */
  busy?: ActionKey;
  /** It opens a menu above the foot: whether that menu is open. */
  expanded?: boolean;
  /** Where focus returns once the menu it opened closes: its button, else the ⋯. */
  buttonRef?: Ref<HTMLButtonElement>;
} & (
    | { cause?: undefined }
    | {
        disabled: true;
        /**
         * Why the blocked item cannot run. The foot shows it as a button,
         * never behind the ⋯, whose tooltip states it; a menu shows no cause.
         */
        cause: string;
      }
  );

// The primary where the ⋮ order already leads with the next step (#1065). The
// item whose write runs keeps it, so its button spins and holds focus.
export const firstEnabled = (items: readonly FootItem[]): string | null =>
  items.find(
    (item) =>
      item.href === undefined &&
      (!item.disabled || item.busy !== undefined) &&
      !item.danger,
  )?.label ?? null;

export function FootActions({
  name,
  items,
  primary,
}: {
  /** What the pane shows, which names the ⋯ as the row's ⋮ is named. */
  name: string;
  items: readonly FootItem[];
  /** The label of the one primary item, or null for none. */
  primary: string | null;
}) {
  const shown = (item: FootItem) =>
    item.label === primary || item.edit === true || item.cause !== undefined;
  const buttons = items.filter(shown);
  const more = items.filter((item) => !shown(item));
  const moreRef = (node: HTMLButtonElement | null) => {
    for (const { buttonRef } of more) {
      if (typeof buttonRef === "function") buttonRef(node);
      else if (buttonRef) buttonRef.current = node;
    }
  };
  return (
    <>
      {buttons.map((item) =>
        item.cause !== undefined ? (
          <GatedButton
            key={item.label}
            size="md"
            variant="quiet"
            label={item.label}
            unavailable={item.cause}
          />
        ) : (
          <Button
            key={item.label}
            ref={item.buttonRef}
            size="md"
            variant={item.label === primary ? "primary" : "quiet"}
            aria-label={item.name}
            aria-expanded={item.expanded}
            busy={item.busy !== undefined}
            blocked={item.disabled}
            onClick={item.onSelect}
          >
            {item.busy === undefined ? item.label : ACTIONS[item.busy].busy}
          </Button>
        ),
      )}
      {more.length > 0 ? (
        <ActionsMenu
          label={rowActionsLabel(name)}
          items={more}
          trigger={
            <Button
              ref={moreRef}
              size="icon"
              variant="quiet"
              className="ml-auto"
            >
              ⋯
            </Button>
          }
        />
      ) : null}
    </>
  );
}
