import { useId, useRef } from "react";
import {
  IMPORTED,
  IMPORTED_NEXT_STEP,
  NOT_IMPORTED,
} from "../deploy-state/import-local-edits-copy";
import { Button } from "../ui/button";
import { IMPORT_PROMPTS } from "../ui/control-labels";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList } from "../ui/grouped-list";
import { Report } from "../ui/report";
import { SegmentedControl } from "../ui/segmented-control";
import { CHANGE_WORD } from "./change-words";
import {
  CHOOSE_FILES,
  CHOOSE_FILES_FIRST,
  importPromptsConfirm,
  importPromptsNotice,
  importPromptsReportHeading,
  NO_PROMPT_QUALIFIES,
  NOTHING_CHECKED,
  PROMPT_FILE_REFUSALS,
  PROMPT_FILES_HINT,
  PROMPT_FILES_LABEL,
  PROMPT_SOURCE_LABEL,
  PROMPT_SOURCES,
} from "./import-prompts-copy";
import { PastedPromptFields } from "./pasted-prompt-fields";
import type { ImportPromptsFlow } from "./use-import-prompts-flow";

// The chosen files or the pasted prompt as a checklist, then the Report in the
// same dialog. Presentational: the flow owns the reads, the checks and the
// request.
export function ImportPromptsDialog({
  source,
  switchSource,
  checklist,
  pasted,
  running,
  report,
  error,
  chooseFiles,
  submit,
  close,
}: ImportPromptsFlow) {
  const labelId = useId();
  const hintId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const { rows, checked, toggle, groups } = checklist;
  const ready = (rows ?? []).filter((row) => row.refusal === null);
  // A pasted prompt lists only once the Harness holds its name; its Category
  // is the field's, so its row takes no menu.
  const listed =
    source === "paste" ? rows?.some((row) => row.held) === true : rows !== null;
  const listGroups = groups(
    (refusal) => PROMPT_FILE_REFUSALS[refusal],
    running,
  ).map((group) =>
    source === "paste"
      ? {
          ...group,
          rows: group.rows.map(({ control: _, choice: __, ...row }) => row),
        }
      : group,
  );
  const run = dialogRun({
    source:
      report === null
        ? {
            label: importPromptsConfirm(checked.size),
            verb: "import",
            tone: "primary",
            unavailable:
              rows === null
                ? CHOOSE_FILES_FIRST
                : ready.length === 0
                  ? NO_PROMPT_QUALIFIES
                  : checked.size === 0
                    ? NOTHING_CHECKED
                    : null,
            onRun: submit,
          }
        : null,
    running,
    outcome: report !== null,
  });

  return (
    <Dialog
      title={IMPORT_PROMPTS}
      version={null}
      width={640}
      {...run}
      failure={
        report === null ? (pasted.failure ?? importPromptsNotice(error)) : null
      }
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      fieldsChanged={source === "paste" ? pasted.changed : rows !== null}
      onClose={close}
    >
      {report !== null ? (
        <Report
          heading={importPromptsReportHeading(
            report.outcomes.filter((outcome) => outcome.imported).length,
            report.outcomes.length,
          )}
          groups={[
            ...report.unsavedCategories,
            {
              tone: "failed",
              label: NOT_IMPORTED,
              rows: report.outcomes.flatMap((outcome) =>
                outcome.imported
                  ? []
                  : [
                      {
                        name: outcome.name,
                        detail: PROMPT_FILE_REFUSALS[outcome.refusal],
                      },
                    ],
              ),
            },
            {
              tone: "good",
              label: IMPORTED,
              note: IMPORTED_NEXT_STEP,
              rows: report.outcomes.flatMap((outcome) =>
                outcome.imported
                  ? [
                      {
                        name: outcome.name,
                        change:
                          CHANGE_WORD[
                            outcome.mode === "update" ? "edit" : "addition"
                          ],
                      },
                    ]
                  : [],
              ),
            },
          ]}
        />
      ) : (
        <>
          <SegmentedControl
            label={PROMPT_SOURCE_LABEL}
            segments={PROMPT_SOURCES}
            value={source}
            onChange={switchSource}
            className="self-start"
          />
          {source === "paste" ? (
            <PastedPromptFields pasted={pasted} disabled={running} />
          ) : (
            <div className="flex flex-col gap-tight">
              <span id={labelId} className="font-medium text-row">
                {PROMPT_FILES_LABEL}
              </span>
              <span id={hintId} className="font-ui text-gray-11 text-meta">
                {PROMPT_FILES_HINT}
              </span>
              <input
                ref={fileInput}
                type="file"
                accept=".md,.txt"
                multiple
                hidden
                onChange={(event) => {
                  const files = [...(event.currentTarget.files ?? [])];
                  // Cleared, so choosing the same files again reads them again.
                  event.currentTarget.value = "";
                  if (files.length > 0) void chooseFiles(files);
                }}
              />
              <Button
                type="button"
                variant="quiet"
                className="mt-tight self-start"
                aria-describedby={`${labelId} ${hintId}`}
                disabled={running}
                onClick={() => fileInput.current?.click()}
              >
                {CHOOSE_FILES}
              </Button>
            </div>
          )}
          {listed ? (
            <GroupedList
              groups={listGroups}
              checklist={{
                checked,
                onToggle: toggle,
                isRunning: running,
                firstBox: null,
              }}
              live={null}
            />
          ) : null}
        </>
      )}
    </Dialog>
  );
}
