import type { HarnessChange, PendingMovement } from "@maestro/core";
import { TYPE_WORD } from "../inventory/type-filter";
import { GroupedList } from "../ui/grouped-list";
import { SubListHeading } from "../ui/sub-list-heading";
import { CHANGE_WORD } from "./change-words";

// The dialog's group order.
const GROUPS: readonly HarnessChange[] = [
  "addition",
  "edit",
  "rename",
  "deletion",
];

// Type, then Author, in spacing steps: 88px and 80px.
const SLOTS = [22, 20];

export function ReleaseDelta({ movements }: { movements: PendingMovement[] }) {
  const groups = GROUPS.map((change) => {
    const rows = movements.filter((movement) => movement.change === change);
    return {
      tone: "neutral" as const,
      legend: `${CHANGE_WORD[change]} · ${rows.length}`,
      rows: rows.map((movement) => ({
        key: `${movement.type}:${movement.name}`,
        name:
          movement.previousName === undefined
            ? movement.name
            : `${movement.previousName} → ${movement.name}`,
        slots: [TYPE_WORD[movement.type], movement.author ?? "Unknown"],
      })),
    };
  });
  return (
    <section className="flex flex-col gap-inline">
      <SubListHeading
        label="Pending release"
        count={movements.length}
        headingRef={null}
      />
      <GroupedList groups={groups} checklist={null} slots={SLOTS} live={null} />
    </section>
  );
}
