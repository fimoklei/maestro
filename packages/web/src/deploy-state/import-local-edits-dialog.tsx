import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
} from "react";
import { copiesDiffer, localEditsRefusal } from "../harness/notice-copy";
import { cn } from "../ui/cn";
import { Dialog } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import type { NoticeContent } from "../ui/notice";
import { Report } from "../ui/report";
import {
  CHECKING_LOCAL_EDITS,
  canBeImportedLegend,
  cannotBeImportedLegend,
  IMPORTED,
  IMPORTED_NEXT_STEP,
  importConfirmLabel,
  importLocalEditsTitle,
  importReportHeading,
  NO_LOCAL_EDITS,
  NO_SKILL_QUALIFIES,
  NONE_SELECTED,
  NOT_IMPORTED,
  noLocalEditsLine,
  undoesNewerLegend,
  undoesNewerLine,
} from "./import-local-edits-copy";
import type { LocalEditsSkill } from "./use-import-local-edits";

// The checklist and the Report that replaces it when any skill was refused.
// Presentational: the host owns the check, the checks and the request.
export function ImportLocalEditsDialog({
  targetName,
  skills,
  checked,
  onToggle,
  isRunning,
  outcomes,
  failure,
  onCancel,
  onConfirm,
}: {
  targetName: string;
  // Null while the check runs.
  skills: readonly LocalEditsSkill[] | null;
  checked: ReadonlySet<string>;
  onToggle: (name: string) => void;
  isRunning: boolean;
  // Null before the run; set only when the dialog stays open on a refusal.
  outcomes: readonly LocalEditsSkill[] | null;
  failure: NoticeContent | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  // The check answers after the dialog opened: focus moves to the first
  // checkbox once, when the list appears.
  const firstBox = useRef<HTMLInputElement>(null);
  const listed = skills !== null;
  useEffect(() => {
    if (listed) firstBox.current?.focus();
  }, [listed]);
  const eligible = (skills ?? []).filter(
    (skill) => skill.refusal === null && skill.undoesNewerSince === undefined,
  );
  const flagged = (skills ?? []).flatMap(
    ({ name, refusal, undoesNewerSince }) =>
      refusal === null && undoesNewerSince !== undefined
        ? [{ name, release: undoesNewerSince }]
        : [],
  );
  const refused = (skills ?? []).flatMap(({ refusal, ...skill }) =>
    refusal === null ? [] : [{ ...skill, refusal }],
  );
  const count = [...eligible, ...flagged].filter((skill) =>
    checked.has(skill.name),
  ).length;
  const undoing = flagged.filter((skill) => checked.has(skill.name)).length;
  const empty = skills !== null && skills.length === 0;
  const offered =
    outcomes === null && skills !== null && !empty && failure === null;

  return (
    <Dialog
      title={importLocalEditsTitle(targetName)}
      version={null}
      width={640}
      phase={
        isRunning ? "running" : outcomes === null && !empty ? "idle" : "outcome"
      }
      action={
        offered
          ? {
              label: importConfirmLabel(count, undoing),
              verb: "import",
              tone: "primary",
              unavailable:
                eligible.length === 0 && flagged.length === 0
                  ? NO_SKILL_QUALIFIES
                  : count === 0
                    ? NONE_SELECTED
                    : null,
              onRun: onConfirm,
            }
          : null
      }
      failure={failure}
      describedBy={null}
      fieldsChanged={false}
      onClose={onCancel}
    >
      {outcomes !== null ? (
        <Report
          heading={importReportHeading(
            outcomes.filter((row) => row.refusal === null).length,
            outcomes.length,
          )}
          groups={[
            {
              tone: "failed",
              label: NOT_IMPORTED,
              rows: outcomes.flatMap((row) =>
                row.refusal === null
                  ? []
                  : [
                      {
                        name: row.name,
                        detail: (
                          <RefusalSentence
                            refusal={row.refusal}
                            folders={row.folders}
                          />
                        ),
                      },
                    ],
              ),
            },
            {
              tone: "good",
              label: IMPORTED,
              note: IMPORTED_NEXT_STEP,
              rows: outcomes
                .filter((row) => row.refusal === null)
                .map((row) => ({ name: row.name })),
            },
          ]}
        />
      ) : skills === null ? (
        failure === null ? (
          <p role="status" className="m-0 text-gray-11">
            {CHECKING_LOCAL_EDITS}
          </p>
        ) : null
      ) : empty ? (
        <EmptyState
          title={NO_LOCAL_EDITS}
          description={noLocalEditsLine(targetName)}
          headingLevel={3}
        />
      ) : (
        <>
          <CheckGroup
            tone="eligible"
            legend={canBeImportedLegend(eligible.length)}
            rows={eligible.map(({ name }) => ({ name }))}
            checked={checked}
            onToggle={onToggle}
            isRunning={isRunning}
            firstBox={firstBox}
          />
          <CheckGroup
            tone="flagged"
            legend={undoesNewerLegend(flagged.length)}
            rows={flagged.map(({ name, release }) => ({
              name,
              sentence: undoesNewerLine(release),
            }))}
            checked={checked}
            onToggle={onToggle}
            isRunning={isRunning}
            firstBox={eligible.length === 0 ? firstBox : null}
          />
          <CheckGroup
            tone="refused"
            legend={cannotBeImportedLegend(refused.length)}
            rows={refused.map((skill) => ({
              name: skill.name,
              sentence: <RefusalSentence {...skill} />,
            }))}
            checked={checked}
            onToggle={onToggle}
            isRunning={isRunning}
            firstBox={
              eligible.length === 0 && flagged.length === 0 ? firstBox : null
            }
          />
        </>
      )}
    </Dialog>
  );
}

const GROUP_TONES = {
  eligible: {
    legend: "text-gray-11",
    edge: "border-edge",
    row: "h-8",
    name: "",
    sentence: "",
  },
  flagged: {
    legend: "text-amber-12",
    edge: "border-amber-7",
    row: "bg-amber-3 py-inline",
    name: "",
    sentence: "text-amber-12",
  },
  refused: {
    legend: "text-red-12",
    edge: "border-edge",
    row: "py-inline",
    name: "text-gray-11",
    sentence: "text-gray-11",
  },
} as const;

// One fieldset of the checklist; hidden while empty. A refused box is
// aria-disabled, not disabled: it stays focusable so its reason is heard, and
// a click changes nothing.
function CheckGroup({
  tone,
  legend,
  rows,
  checked,
  onToggle,
  isRunning,
  firstBox,
}: {
  tone: keyof typeof GROUP_TONES;
  legend: string;
  rows: readonly { name: string; sentence?: ReactNode }[];
  checked: ReadonlySet<string>;
  onToggle: (name: string) => void;
  isRunning: boolean;
  // Set on the group whose first box takes focus when the list appears.
  firstBox: RefObject<HTMLInputElement | null> | null;
}) {
  const id = useId();
  if (rows.length === 0) return null;
  const style = GROUP_TONES[tone];
  const refused = tone === "refused";
  return (
    <fieldset id={id} className="m-0 flex min-w-0 flex-col gap-tight">
      <legend
        className={cn(
          "font-mono font-semibold text-meta uppercase tracking-mono-wide",
          style.legend,
        )}
      >
        {legend}
      </legend>
      <ul
        className={cn(
          "m-0 flex list-none flex-col overflow-hidden rounded-control border p-0",
          style.edge,
        )}
      >
        {rows.map((row, index) => (
          <li
            key={row.name}
            className={cn(
              "grid grid-cols-[auto_1fr] items-center gap-x-inline gap-y-tight px-cell",
              style.row,
              index < rows.length - 1 && cn("border-b", style.edge),
            )}
          >
            <input
              ref={index === 0 && firstBox !== null ? firstBox : undefined}
              id={`${id}-box-${index}`}
              type="checkbox"
              aria-describedby={
                row.sentence === undefined ? undefined : `${id}-${index}`
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
                    className: "size-4 shrink-0 cursor-pointer accent-gray-12",
                    checked: checked.has(row.name),
                    disabled: isRunning,
                    onChange: () => onToggle(row.name),
                  })}
            />
            <label
              htmlFor={`${id}-box-${index}`}
              className={cn(
                "min-w-0 truncate text-row",
                !refused && "cursor-pointer",
                style.name,
              )}
            >
              {row.name}
            </label>
            {row.sentence === undefined ? null : (
              <p
                id={`${id}-${index}`}
                className={cn("col-start-2 m-0 text-meta", style.sentence)}
              >
                {row.sentence}
              </p>
            )}
          </li>
        ))}
      </ul>
    </fieldset>
  );
}

// The differing copies' folders are paths: mono, wrapping inside the row.
function RefusalSentence(
  skill: Pick<LocalEditsSkill, "folders"> & {
    refusal: NonNullable<LocalEditsSkill["refusal"]>;
  },
) {
  const { folders } = skill;
  if (folders === undefined) {
    return <>{localEditsRefusal(skill)}</>;
  }
  const path = "break-all font-mono";
  const [lead, claude, or, codex, end] = copiesDiffer({
    claude: <code className={path}>{folders.claude}</code>,
    codex: <code className={path}>{folders.codex}</code>,
  });
  return (
    <>
      {lead}
      {claude}
      {or}
      {codex}
      {end}
    </>
  );
}
