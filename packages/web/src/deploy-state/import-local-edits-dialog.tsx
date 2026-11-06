import type { LocalEditsSkill } from "@maestro/core";
import { useEffect, useRef } from "react";
import { localEditsRefusal } from "../harness/import-notice-copy";
import { Dialog, dialogRun } from "../ui/dialog";
import { EmptyState } from "../ui/empty-state";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { PhraseText } from "../ui/phrase-text";
import { RadioGroup } from "../ui/radio-group";
import { Report } from "../ui/report";
import { StatusLine } from "../ui/status-line";
import { CHECKING_LOCAL_EDITS } from "./deploy-state-copy";
import {
  COPIES_DIFFER_LINE,
  COPY_TO_IMPORT,
  canBeImportedLegend,
  cannotBeImportedLegend,
  copiesDifferLegend,
  IMPORTED,
  IMPORTED_NEXT_STEP,
  importConfirmLabel,
  importLocalEditsTitle,
  importReportHeading,
  MERGE_COPIES_LINE,
  NO_LOCAL_EDITS,
  NO_SKILL_QUALIFIES,
  NOT_IMPORTED,
  NOTHING_CHECKED,
  noLocalEditsLine,
  SELECT_A_COPY,
  UNSELECTED_COPIES_LINE,
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
  selections,
  onSelect,
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
  /** The folder selected per skill whose copies differ. */
  selections: ReadonlyMap<string, string>;
  onSelect: (name: string, folder: string) => void;
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
  const firstRadio = useRef<HTMLInputElement>(null);
  const listed = skills !== null;
  useEffect(() => {
    if (listed) (firstRadio.current ?? firstBox.current)?.focus();
  }, [listed]);
  // A skill whose copies differ is imported from the copy selected for it, so
  // it carries no checkbox: Cancel is the way not to import it.
  const differing = (skills ?? []).flatMap(
    ({ name, refusal, folders, undoesNewerSince }) =>
      refusal === null && folders !== undefined
        ? [{ name, folders, undoesNewerSince }]
        : [],
  );
  const listedApart = (skill: LocalEditsSkill) =>
    skill.refusal === null && skill.folders === undefined;
  const eligible = (skills ?? []).filter(
    (skill) => listedApart(skill) && skill.undoesNewerSince === undefined,
  );
  const flagged = (skills ?? []).flatMap((skill) =>
    listedApart(skill) && skill.undoesNewerSince !== undefined
      ? [{ name: skill.name, release: skill.undoesNewerSince }]
      : [],
  );
  const refused = (skills ?? []).flatMap(({ refusal, name }) =>
    refusal === null ? [] : [{ name, refusal }],
  );
  const count =
    differing.length +
    [...eligible, ...flagged].filter((skill) => checked.has(skill.name)).length;
  const undoing =
    differing.filter((skill) => skill.undoesNewerSince !== undefined).length +
    flagged.filter((skill) => checked.has(skill.name)).length;
  const unselected = differing.some((skill) => !selections.has(skill.name));
  const empty = skills !== null && skills.length === 0;
  const checking = skills === null && failure === null;
  // A running import keeps its confirm: a check that fails mid-run must not
  // hide its busy label.
  const offered =
    isRunning || (outcomes === null && !empty && failure === null);
  const run = dialogRun({
    source: offered
      ? {
          label: importConfirmLabel(count, undoing),
          verb: "import",
          tone: "primary",
          unavailable: checking
            ? CHECKING_LOCAL_EDITS
            : differing.length + eligible.length + flagged.length === 0
              ? NO_SKILL_QUALIFIES
              : unselected
                ? SELECT_A_COPY
                : count === 0
                  ? NOTHING_CHECKED
                  : null,
          onRun: onConfirm,
        }
      : null,
    running: isRunning,
    outcome: outcomes !== null || empty,
  });

  return (
    <Dialog
      title={importLocalEditsTitle(targetName)}
      version={null}
      width={640}
      {...run}
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
                        detail: localEditsRefusal({ refusal: row.refusal }),
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
        <>
          {differing.length === 0 ? null : (
            <>
              <GroupedList
                groups={[
                  {
                    tone: "attention",
                    legend: copiesDifferLegend(differing.length),
                    rows: differing.map((skill, index) => ({
                      key: skill.name,
                      name: skill.name,
                      sentence:
                        skill.undoesNewerSince === undefined ? (
                          COPIES_DIFFER_LINE
                        ) : (
                          <>
                            {COPIES_DIFFER_LINE}{" "}
                            <PhraseText
                              copy={undoesNewerLine(skill.undoesNewerSince)}
                            />
                          </>
                        ),
                      choice: (
                        <RadioGroup
                          label={COPY_TO_IMPORT}
                          options={skill.folders}
                          value={selections.get(skill.name) ?? null}
                          onChange={(folder) => onSelect(skill.name, folder)}
                          disabled={isRunning}
                          firstRadio={index === 0 ? firstRadio : null}
                        />
                      ),
                    })),
                  },
                ]}
                checklist={null}
                live={null}
              />
              <p className="m-0 font-ui text-gray-11 text-meta">
                {MERGE_COPIES_LINE}
              </p>
              <p className="m-0 font-ui text-gray-11 text-meta">
                {UNSELECTED_COPIES_LINE}
              </p>
            </>
          )}
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
                rows: refused.map(({ name, refusal }) => ({
                  key: name,
                  name,
                  sentence: localEditsRefusal({ refusal }),
                })),
              },
            ]}
            checklist={{ checked, onToggle, isRunning, firstBox }}
            live={null}
          />
        </>
      )}
    </Dialog>
  );
}
