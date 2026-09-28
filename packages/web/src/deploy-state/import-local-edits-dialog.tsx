import { useEffect, useId, useRef } from "react";
import { COPIES_DIFFER, localEditsRefusal } from "../harness/notice-copy";
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
  const groupId = useId();
  const refusedId = useId();
  // The check answers after the dialog opened: focus moves to the first
  // checkbox once, when the list appears.
  const firstBox = useRef<HTMLInputElement>(null);
  const listed = skills !== null;
  useEffect(() => {
    if (listed) firstBox.current?.focus();
  }, [listed]);
  const eligible = (skills ?? []).filter((skill) => skill.refusal === null);
  const refused = (skills ?? []).flatMap(({ refusal, ...skill }) =>
    refusal === null ? [] : [{ ...skill, refusal }],
  );
  const count = eligible.filter((skill) => checked.has(skill.name)).length;
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
              label: importConfirmLabel(count),
              verb: "import",
              tone: "primary",
              unavailable:
                eligible.length === 0
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
          {eligible.length === 0 ? null : (
            <fieldset
              id={groupId}
              className="m-0 flex min-w-0 flex-col gap-tight"
            >
              <legend className="font-mono font-semibold text-gray-11 text-meta uppercase tracking-mono-wide">
                {canBeImportedLegend(eligible.length)}
              </legend>
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-control border border-edge p-0">
                {eligible.map((skill, index) => (
                  <li
                    key={skill.name}
                    className={cn(
                      "flex h-8 items-center px-cell",
                      index < eligible.length - 1 && "border-edge border-b",
                    )}
                  >
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-inline text-row">
                      <input
                        ref={index === 0 ? firstBox : undefined}
                        type="checkbox"
                        className="size-4 shrink-0 accent-gray-12"
                        checked={checked.has(skill.name)}
                        disabled={isRunning}
                        onChange={() => onToggle(skill.name)}
                      />
                      <span className="truncate">{skill.name}</span>
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
          {refused.length === 0 ? null : (
            <fieldset
              id={refusedId}
              className="m-0 flex min-w-0 flex-col gap-tight"
            >
              <legend className="font-mono font-semibold text-meta text-red-12 uppercase tracking-mono-wide">
                {cannotBeImportedLegend(refused.length)}
              </legend>
              <ul className="m-0 flex list-none flex-col overflow-hidden rounded-control border border-edge p-0">
                {refused.map((skill, index) => (
                  <li
                    key={skill.name}
                    className={cn(
                      "grid grid-cols-[auto_1fr] items-center gap-x-inline gap-y-tight px-cell py-inline",
                      index < refused.length - 1 && "border-edge border-b",
                    )}
                  >
                    {/* aria-disabled, not disabled: it stays focusable so its
                        reason is heard. A click changes nothing. */}
                    <input
                      ref={
                        eligible.length === 0 && index === 0
                          ? firstBox
                          : undefined
                      }
                      id={`${refusedId}-box-${index}`}
                      type="checkbox"
                      aria-disabled="true"
                      aria-describedby={`${refusedId}-${index}`}
                      className="size-4 cursor-not-allowed opacity-50"
                      checked={false}
                      readOnly
                      onClick={(event) => event.preventDefault()}
                    />
                    <label
                      htmlFor={`${refusedId}-box-${index}`}
                      className="min-w-0 truncate text-gray-11 text-row"
                    >
                      {skill.name}
                    </label>
                    <p
                      id={`${refusedId}-${index}`}
                      className="col-start-2 m-0 text-gray-11 text-meta"
                    >
                      <RefusalSentence {...skill} />
                    </p>
                  </li>
                ))}
              </ul>
            </fieldset>
          )}
        </>
      )}
    </Dialog>
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
  return (
    <>
      {COPIES_DIFFER}: <code className={path}>{folders.claude}</code> or{" "}
      <code className={path}>{folders.codex}</code>.
    </>
  );
}
