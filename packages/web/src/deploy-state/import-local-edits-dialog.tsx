import { useEffect, useId, useRef } from "react";
import { cn } from "../ui/cn";
import { Dialog } from "../ui/dialog";
import type { NoticeContent } from "../ui/notice";
import { Report } from "../ui/report";
import {
  CHECKING_LOCAL_EDITS,
  canBeImportedLegend,
  IMPORTED,
  importConfirmLabel,
  importLocalEditsTitle,
  importReportHeading,
  NONE_SELECTED,
  NOT_IMPORTED,
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
  // The check answers after the dialog opened: focus moves to the first
  // checkbox once, when the list appears.
  const firstBox = useRef<HTMLInputElement>(null);
  const listed = skills !== null;
  useEffect(() => {
    if (listed) firstBox.current?.focus();
  }, [listed]);
  // ponytail: refused skills stay unlisted until #1255 adds their group.
  const eligible = (skills ?? []).filter((skill) => skill.refusal === null);
  const count = eligible.filter((skill) => checked.has(skill.name)).length;
  const offered = outcomes === null && skills !== null && failure === null;

  return (
    <Dialog
      title={importLocalEditsTitle(targetName)}
      version={null}
      width={640}
      phase={isRunning ? "running" : outcomes === null ? "idle" : "outcome"}
      action={
        offered
          ? {
              label: importConfirmLabel(count),
              verb: "import",
              tone: "primary",
              unavailable: count === 0 ? NONE_SELECTED : null,
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
              rows: outcomes
                .filter((row) => row.refusal !== null)
                .map((row) => ({ name: row.name })),
            },
            {
              tone: "good",
              label: IMPORTED,
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
      ) : (
        <fieldset id={groupId} className="m-0 flex min-w-0 flex-col gap-tight">
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
    </Dialog>
  );
}
