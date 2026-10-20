import type {
  HarnessChange,
  HarnessMovementKind,
  PendingMovement,
} from "@maestro/core";
import { TYPE_WORD } from "../inventory/type-filter";
import { GroupedList } from "../ui/grouped-list";
import { SubListHeading } from "../ui/sub-list-heading";
import { CHANGE_WORDS } from "./stage-copy";

// In the dialog's group order. A movement shows the Change its row shows on
// the Harness screen.
const GROUPS: Record<HarnessMovementKind, HarnessChange> = {
  added: "addition",
  changed: "edit",
  renamed: "rename",
  removed: "deletion",
};

// Type, then Author, in spacing steps: 88px and 80px.
const SLOTS = [22, 20];

export function ReleaseDelta({ movements }: { movements: PendingMovement[] }) {
  // A Record over HarnessMovementKind has exactly those kinds as keys.
  const groups = (Object.keys(GROUPS) as HarnessMovementKind[]).map((kind) => {
    const rows = movements.filter((movement) => movement.kind === kind);
    return {
      tone: "neutral" as const,
      legend: `${CHANGE_WORDS[GROUPS[kind]]} · ${rows.length}`,
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
