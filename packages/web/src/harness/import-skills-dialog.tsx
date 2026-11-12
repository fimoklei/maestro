import type { SkillFolder, SkillFolderScan } from "@maestro/core";
import {
  alreadyInHarnessLegend,
  canBeImportedLegend,
  cannotBeImportedLegend,
  IMPORTED,
  IMPORTED_NEXT_STEP,
  importConfirmLabel,
  importReportHeading,
  NO_SKILL_QUALIFIES,
  NOT_IMPORTED,
  NOTHING_CHECKED,
  REPLACES_LINE,
} from "../deploy-state/import-local-edits-copy";
import { IMPORT_SKILLS } from "../ui/control-labels";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList } from "../ui/grouped-list";
import { Notice, type NoticeContent } from "../ui/notice";
import { PathField } from "../ui/path-field";
import { Report } from "../ui/report";
import { StatusLine } from "../ui/status-line";
import type { FolderChooser } from "../ui/use-folder-chooser";
import { CHANGE_WORD } from "./change-words";
import {
  IMPORT_SKILLS_HINT,
  IMPORT_SKILLS_PLACEHOLDER,
  NO_SKILL_FOLDERS,
  READING_FOLDER,
  skillFolderRefusal,
} from "./import-skills-copy";
import { sourceBlockerNotice } from "./import-view-model";

// A folder whose name yields no skill name still needs a row name.
const shownName = ({ entry, name }: SkillFolder): string =>
  name === "" ? entry : name;

/** The scan as the dialog shows it: none asked, under way, failed, or in hand. */
export type SkillFolderLoad =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "error"; notice: NoticeContent | null }
  | { kind: "ready"; scan: SkillFolderScan };

// The checklist of the folders inside one chosen folder, and the Report that
// replaces it once the import answers. Presentational: the host owns the scan,
// the checks and the request.
export function ImportSkillsDialog({
  source,
  sourceText,
  sourceError,
  onSourceChange,
  onSourceCommit,
  chooser,
  load,
  checked,
  onToggle,
  isRunning,
  outcomes,
  failure,
  onClose,
  onImport,
}: {
  /** The folder last sent to the scan; null until one is chosen. */
  source: string | null;
  sourceText: string;
  /** The field error a submit left on Folder path. */
  sourceError: string | undefined;
  onSourceChange: (text: string) => void;
  /** A folder to scan: picked through Browse, or typed and left. */
  onSourceCommit: (path: string) => void;
  chooser: FolderChooser;
  load: SkillFolderLoad;
  /** The entries ticked to import. */
  checked: ReadonlySet<string>;
  onToggle: (entry: string) => void;
  isRunning: boolean;
  /** Null until the import answers. */
  outcomes: readonly SkillFolder[] | null;
  failure: NoticeContent | null;
  onClose: () => void;
  onImport: () => void;
}) {
  const folders = load.kind === "ready" ? load.scan.folders : [];
  const ready = folders.filter((folder) => folder.refusal === null);
  const fresh = ready.filter((folder) => !folder.replaces);
  const held = ready.filter((folder) => folder.replaces);
  const refused = folders.flatMap((folder) =>
    folder.refusal === null
      ? []
      : [
          {
            entry: folder.entry,
            name: shownName(folder),
            refusal: folder.refusal,
          },
        ],
  );
  const count = ready.filter((folder) => checked.has(folder.entry)).length;
  const folderProblem =
    load.kind === "error"
      ? load.notice
      : load.kind === "ready"
        ? (sourceBlockerNotice(load.scan.folderBlocker) ??
          (folders.length === 0
            ? { level: "info" as const, ...NO_SKILL_FOLDERS }
            : null))
        : null;
  const run = dialogRun({
    source:
      outcomes === null
        ? {
            label: importConfirmLabel(count, 0),
            verb: "import",
            tone: "primary",
            // Before a scan the press scans, or states the empty field.
            unavailable:
              load.kind === "loading"
                ? READING_FOLDER
                : load.kind !== "ready"
                  ? null
                  : folders.length === 0
                    ? (folderProblem?.label ?? null)
                    : ready.length === 0
                      ? NO_SKILL_QUALIFIES
                      : count === 0
                        ? NOTHING_CHECKED
                        : null,
            onRun: onImport,
          }
        : null,
    running: isRunning,
    outcome: outcomes !== null,
  });

  return (
    <Dialog
      title={IMPORT_SKILLS}
      version={null}
      width={640}
      {...run}
      failure={failure}
      describedBy={null}
      fieldsChanged={sourceText !== ""}
      onClose={onClose}
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
                        name: shownName(row),
                        detail: skillFolderRefusal(row.refusal),
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
                .map(({ name, replaces }) => ({
                  name,
                  change: CHANGE_WORD[replaces ? "edit" : "addition"],
                })),
            },
          ]}
        />
      ) : (
        <>
          <div className="flex flex-col gap-inline">
            {/* Scanned right after a pick, and once a typed path is left. */}
            <PathField
              label="Folder path"
              hint={IMPORT_SKILLS_HINT}
              placeholder={IMPORT_SKILLS_PLACEHOLDER}
              className="placeholder:text-gray-11"
              value={sourceText}
              onChange={onSourceChange}
              onPicked={onSourceCommit}
              onBlur={() => {
                const typed = sourceText.trim();
                if (typed !== "" && typed !== source) onSourceCommit(typed);
              }}
              chooser={chooser}
              error={sourceError}
              disabled={isRunning}
            />
            <Notice trigger="user-action" notice={folderProblem} />
          </div>
          {load.kind === "loading" ? (
            <StatusLine>{READING_FOLDER}</StatusLine>
          ) : null}
          {folders.length === 0 ? null : (
            <GroupedList
              groups={[
                {
                  tone: "neutral",
                  legend: canBeImportedLegend(fresh.length),
                  rows: fresh.map(({ entry, name }) => ({ key: entry, name })),
                },
                {
                  tone: "attention",
                  legend: alreadyInHarnessLegend(held.length),
                  rows: held.map(({ entry, name }) => ({
                    key: entry,
                    name,
                    sentence: REPLACES_LINE,
                  })),
                },
                {
                  tone: "failed",
                  legend: cannotBeImportedLegend(refused.length),
                  rows: refused.map(({ entry, name, refusal }) => ({
                    key: entry,
                    name,
                    sentence: skillFolderRefusal(refusal),
                  })),
                },
              ]}
              checklist={{ checked, onToggle, isRunning, firstBox: null }}
              live={null}
            />
          )}
        </>
      )}
    </Dialog>
  );
}
