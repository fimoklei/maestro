import { ArrowUpRight } from "lucide-react";
import type { Ref } from "react";
import { ActionsMenu, type ActionsMenuItem } from "./actions-menu";
import { ACTIONS, type ActionKey } from "./busy-copy";
import { Button } from "./button";
import { cn } from "./cn";
import { GatedButton } from "./gated-button";
import { Icon } from "./icon";
import { rowActionsLabel } from "./row-menu-copy";

// The row's ⋮ items as buttons, at most one of them primary; the danger items
// sit behind one ⋯ at the foot's right end, so the foot fits one line (#1485).
export type FootItem = ActionsMenuItem & {
  /** The accessible name where the label alone would not say what it acts on. */
  name?: string;
  /** The next step its state names, which ranks it for the pane's primary. */
  step?: "update" | "import";
  /** Its write is running: picks the busy label from `busy-copy`. */
  busy?: ActionKey;
  /** It opens a menu above the foot: whether that menu is open. */
  expanded?: boolean;
  /** Where focus returns once the menu it opened closes. */
  buttonRef?: Ref<HTMLButtonElement>;
} & (
    | { cause?: undefined }
    | {
        disabled: true;
        /**
         * Why the blocked item cannot run. The foot shows it as a button,
         * danger or not, whose tooltip states it; the ⋮ menu shows no cause.
         */
        cause: string;
      }
  );

// The primary where the ⋮ order already leads with the next step (#1065).
export const firstEnabled = (items: readonly FootItem[]): string | null =>
  items.find(
    (item) => item.href === undefined && !item.disabled && !item.danger,
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
  const hasCause = (item: FootItem) => item.cause !== undefined;
  const buttons = items.filter((item) => !item.danger || hasCause(item));
  const danger = items.filter((item) => item.danger && !hasCause(item));
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
        ) : item.href === undefined ? (
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
        ) : (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className={cn(
              "inline-flex h-control items-center gap-tight rounded-control border border-edge px-cell font-ui text-gray-12 text-row no-underline hover:bg-gray-3",
              "focus-visible:outline-2 focus-visible:outline-blue-9 focus-visible:outline-offset-2",
            )}
          >
            {item.label}
            <Icon of={ArrowUpRight} />
          </a>
        ),
      )}
      {danger.length > 0 ? (
        <ActionsMenu
          label={rowActionsLabel(name)}
          items={danger}
          trigger={
            <Button size="icon" variant="quiet" className="ml-auto">
              ⋯
            </Button>
          }
        />
      ) : null}
    </>
  );
}
