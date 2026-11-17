import type { HarnessChange, PendingMovement } from "@maestro/core";
import { GroupedList } from "../ui/grouped-list";
import { SubListHeading } from "../ui/sub-list-heading";
import { CHANGE_WORD } from "./change-words";
import { CATEGORIES_NAME, rowWords } from "./item-words";
import { STAGE_NAMES } from "./stage-copy";

// The dialog's group order.
const GROUPS: readonly HarnessChange[] = [
  "addition",
  "edit",
  "rename",
  "deletion",
];

// Type, then Author, in spacing steps: 88px and 80px.
const SLOTS = [22, 20];

// The list under the Name its Harness row shows; core names it by its type.
const movementName = (movement: PendingMovement): string => {
  if (movement.type === "categories") {
    return CATEGORIES_NAME;
  }
  return movement.previousName === undefined
    ? movement.name
    : `${movement.previousName} → ${movement.name}`;
};

export function ReleaseDelta({ movements }: { movements: PendingMovement[] }) {
  const groups = GROUPS.map((change) => {
    const rows = movements.filter((movement) => movement.change === change);
    return {
      tone: "neutral" as const,
      legend: `${CHANGE_WORD[change]} · ${rows.length}`,
      rows: rows.map((movement) => ({
        key: `${movement.type}:${movement.name}`,
        name: movementName(movement),
        slots: [rowWords(movement.type).Noun, movement.author ?? "Unknown"],
      })),
    };
  });
  return (
    <section className="flex flex-col gap-inline">
      <SubListHeading
        label={STAGE_NAMES["pending-release"]}
        count={movements.length}
        headingRef={null}
      />
      <GroupedList groups={groups} checklist={null} slots={SLOTS} live={null} />
    </section>
  );
}
