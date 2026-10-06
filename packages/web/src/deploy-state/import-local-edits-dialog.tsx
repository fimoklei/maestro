import type { LocalEditsSkill } from "@maestro/core";
import { useEffect, useRef } from "react";
import { copiesDiffer, localEditsRefusal } from "../harness/notice-copy";
import { Dialog } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { Report } from "../ui/report";
import { StatusLine } from "../ui/status-line";
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

// The checklist and the Report that replaces it when any skill was refused.
// Presentational: the host owns the check, the checks and the request.
export function ImportLocalEditsDialog({
  targetName,
  skills,
  checked,
  checksChanged,
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
  /** Whether any check differs from the one the dialog opened with. */
  checksChanged: boolean;
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
      fieldsChanged={checksChanged}
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
          <StatusLine>{CHECKING_LOCAL_EDITS}</StatusLine>
        ) : null
      ) : empty ? (
        <EmptyState
          title={NO_LOCAL_EDITS}
          description={noLocalEditsLine(targetName)}
          headingLevel={3}
        />
      ) : (
        <GroupedList
          groups={[
            {
              tone: "neutral",
              legend: canBeImportedLegend(eligible.length),
              rows: eligible.map(({ name }) => ({ key: name, name })),
            },
            {
              tone: "attention",
              legend: undoesNewerLegend(flagged.length),
              rows: flagged.map(({ name, release }) => ({
                key: name,
                name,
                sentence: <PhraseText copy={undoesNewerLine(release)} />,
              })),
            },
            {
              tone: "failed",
              legend: cannotBeImportedLegend(refused.length),
              rows: refused.map((skill) => ({
                key: skill.name,
                name: skill.name,
                sentence: <RefusalSentence {...skill} />,
              })),
            },
          ]}
          checklist={{ checked, onToggle, isRunning, firstBox }}
          live={null}
        />
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
