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
} from "./import-prompts-copy";
import { importChecklistGroups } from "./use-import-checklist";
import type { ImportPromptsFlow } from "./use-import-prompts-flow";

// The checklist of chosen files, then the Report in the same dialog.
// Presentational: the flow owns the reads, the checks and the request.
export function ImportPromptsDialog({
  checklist,
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
  const { rows, checked, toggle } = checklist;
  const ready = (rows ?? []).filter((row) => row.refusal === null);
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
      failure={report === null ? importPromptsNotice(error) : null}
      describedBy={null}
      fieldsChanged={rows !== null}
      onClose={close}
    >
      {report !== null ? (
        <Report
          heading={importPromptsReportHeading(
            report.filter((outcome) => outcome.imported).length,
            report.length,
          )}
          groups={[
            {
              tone: "failed",
              label: NOT_IMPORTED,
              rows: report.flatMap((outcome) =>
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
              rows: report.flatMap((outcome) =>
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
          {rows === null ? null : (
            <GroupedList
              groups={importChecklistGroups(
                rows,
                (refusal) => PROMPT_FILE_REFUSALS[refusal],
              )}
              checklist={{
                checked,
                onToggle: toggle,
                isRunning: running,
                firstBox: null,
              }}
              live={null}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
