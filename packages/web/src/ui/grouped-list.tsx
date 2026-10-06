import { type MouseEvent, type ReactNode, type RefObject, useId } from "react";
import { cn } from "./cn";
import { MachineValue } from "./machine-value";
import { LIST_TOKENS, STATUS_TOKENS, type StatusFamily } from "./status-family";

// A dialog's rows grouped by status family: a checklist, or a read-only
// preflight in the same legend, edge and row style. A failed group holds what
// cannot run.

type GroupedListRow = {
  /** What the checked set holds for this row. */
  key: string;
  name: string;
  /** The full text a shortened name stands for, on hover. */
  title?: string;
  value?: string;
  /** Its cost or reason, under the name. */
  sentence?: ReactNode;
  /** The row's own reading where it differs from its group's. */
  tone?: StatusFamily;
  /** For a dialog that reads the row out with its question. */
  id?: string;
};

export type GroupedListGroup = {
  tone: StatusFamily;
  /** The group's name with its count; null where the dialog already names it. */
  legend: string | null;
  rows: readonly GroupedListRow[];
  /** For a dialog that reads the group out with its question. */
  id?: string;
};

type Checklist = {
  checked: ReadonlySet<string>;
  onToggle: (key: string) => void;
  isRunning: boolean;
  /** Takes the first box, for a dialog whose list arrives after it opens. */
  firstBox: RefObject<HTMLInputElement | null> | null;
};

export function GroupedList({
  groups,
  checklist,
  live,
}: {
  groups: readonly GroupedListGroup[];
  /** Null for a read-only list. */
  checklist: Checklist | null;
  /** Names the live region for rows that arrive after the dialog opens; null: none. */
  live: string | null;
}) {
  const drawn = groups.filter((group) => group.rows.length > 0);
  const list = (
    <>
      {drawn.map((group, index) => (
        <Group
          // biome-ignore lint/suspicious/noArrayIndexKey: groups keep their order and a legend may be null
          key={index}
          group={group}
          checklist={checklist}
          takesFocus={index === 0}
        />
      ))}
    </>
  );
  // Named apart, or a reader hears identical regions.
  return live === null ? (
    list
  ) : (
    <div role="status" aria-label={live}>
      {list}
    </div>
  );
}

function Group({
  group,
  checklist,
  takesFocus,
}: {
  group: GroupedListGroup;
  checklist: Checklist | null;
  takesFocus: boolean;
}) {
  const id = useId();
  // Refused, not disabled: the box stays focusable so its reason is heard.
  const refused = group.tone === "failed";
  const { edge } = LIST_TOKENS[group.tone];
  return (
    <fieldset id={group.id} className="m-0 flex min-w-0 flex-col gap-tight">
      {group.legend === null ? null : (
        <legend
          className={cn("font-ui text-meta", STATUS_TOKENS[group.tone].ink)}
        >
          {group.legend}
        </legend>
      )}
      <ul
        className={cn(
          "m-0 flex list-none flex-col overflow-hidden rounded-control border p-0",
          edge,
        )}
      >
        {group.rows.map((row, index) => {
          const tone = row.tone ?? group.tone;
          const marked = row.tone !== undefined && row.tone !== group.tone;
          const boxId = `${id}-box-${index}`;
          const sentenceId = `${id}-sentence-${index}`;
          const lead =
            checklist !== null ? (
              <input
                ref={takesFocus && index === 0 ? checklist.firstBox : undefined}
                id={boxId}
                type="checkbox"
                aria-describedby={
                  row.sentence === undefined ? undefined : sentenceId
                }
                {...(refused
                  ? {
                      "aria-disabled": "true" as const,
                      className: "size-4 cursor-not-allowed opacity-50",
                      checked: false,
                      readOnly: true,
                      onClick: (event: MouseEvent) => event.preventDefault(),
                    }
                  : {
                      className:
                        "size-4 shrink-0 cursor-pointer accent-gray-12",
                      checked: checklist.checked.has(row.key),
                      disabled: checklist.isRunning,
                      onChange: () => checklist.onToggle(row.key),
                    })}
              />
            ) : marked ? (
              <span
                aria-hidden="true"
                className={cn("font-mono text-meta", STATUS_TOKENS[tone].mark)}
              >
                {LIST_TOKENS[tone].glyph}
              </span>
            ) : null;
          const nameClass = "min-w-0 truncate text-gray-12 text-row";
          return (
            <li
              key={row.key}
              id={row.id}
              className={cn(
                "grid min-h-row items-center gap-x-inline gap-y-tight px-cell py-tight",
                lead === null
                  ? "grid-cols-[minmax(0,1fr)_auto]"
                  : "grid-cols-[auto_minmax(0,1fr)_auto]",
                LIST_TOKENS[tone].fill,
                index < group.rows.length - 1 && cn("border-b", edge),
              )}
            >
              {lead}
              {checklist !== null ? (
                <label
                  htmlFor={boxId}
                  className={cn(nameClass, !refused && "cursor-pointer")}
                  title={row.title}
                >
                  {row.name}
                </label>
              ) : (
                <span className={nameClass} title={row.title}>
                  {row.name}
                </span>
              )}
              <span className="break-all text-right text-gray-11 text-meta">
                {row.value === undefined ? null : (
                  <MachineValue>{row.value}</MachineValue>
                )}
              </span>
              {row.sentence === undefined ? null : (
                <p
                  id={sentenceId}
                  className={cn(
                    "col-span-2 m-0 font-ui text-meta",
                    lead !== null && "col-start-2",
                    LIST_TOKENS[tone].sentence,
                  )}
                >
                  {row.sentence}
                </p>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
