import type { CopyMode, CopyPreview } from "@maestro/core";
import { useId } from "react";
import {
  COPY_CATEGORIES,
  COPY_HARNESS_CATEGORIES,
  COPY_MODE_COPY,
  copyGroupLegend,
  copyIntro,
  copySkipped,
  HOW_TO_COPY,
  LOADING_HARNESS_CATEGORIES,
  WHAT_HAPPENS,
} from "../categories/categories-copy";
import { Dialog, dialogRun } from "../ui/dialog";
import { GroupedList } from "../ui/grouped-list";
import type { NoticeContent } from "../ui/notice";
import { OptionRadios } from "../ui/option-radios";
import { PhraseText } from "../ui/phrase-text";
import { StatusLine } from "../ui/status-line";

// Add first: it is preselected, and it keeps everything the operator has.
const MODES = ["add", "replace"] as const satisfies readonly CopyMode[];
const GROUPS = ["added", "deleted", "unchanged"] as const;

// What a copy of the Harness categories does to the operator's list, before
// it runs. An empty own list copies without the choice. The host owns the
// preview read and the copy.
export function CopyHarnessCategoriesDialog({
  preview,
  mode,
  onModeChange,
  failure,
  busy,
  onCopy,
  onClose,
}: {
  /** Null while the preview is read, or when it failed. */
  preview: CopyPreview | null;
  mode: CopyMode;
  onModeChange: (mode: CopyMode) => void;
  /** The failed preview, or the failed copy. */
  failure: NoticeContent | null;
  busy: boolean;
  onCopy: () => void;
  onClose: () => void;
}) {
  const introId = useId();
  const facts = preview?.modes[preview.choice ? mode : "add"];
  const run = dialogRun({
    source:
      preview === null
        ? null
        : {
            label: COPY_CATEGORIES,
            verb: "copy",
            tone: "primary",
            unavailable: null,
            onRun: onCopy,
          },
    running: busy,
    outcome: false,
  });

  return (
    <Dialog
      title={COPY_HARNESS_CATEGORIES}
      version={null}
      width={480}
      {...run}
      failure={failure}
      describedBy={preview === null ? null : introId}
      fieldsChanged={false}
      onClose={onClose}
    >
      {preview === null || facts === undefined ? (
        failure === null ? (
          <StatusLine>{LOADING_HARNESS_CATEGORIES}</StatusLine>
        ) : null
      ) : (
        <>
          <p id={introId} className="m-0 text-gray-11">
            <PhraseText copy={copyIntro(preview.tag, preview.count)} />
          </p>
          {preview.skipped === 0 ? null : (
            <p className="m-0 font-ui text-gray-11 text-meta">
              {copySkipped(preview.skipped)}
            </p>
          )}
          {preview.choice ? (
            <OptionRadios
              legend={HOW_TO_COPY}
              options={MODES.map((value) => ({
                value,
                ...COPY_MODE_COPY[value],
              }))}
              value={mode}
              onChange={onModeChange}
              disabled={busy}
            />
          ) : null}
          <h3 className="m-0 font-semibold font-ui text-gray-12 text-row">
            {WHAT_HAPPENS}
          </h3>
          <GroupedList
            groups={GROUPS.map((group) => ({
              tone: "neutral",
              legend: copyGroupLegend(group, facts[group].length),
              rows: facts[group].map((name) => ({ key: name, name })),
            }))}
            checklist={null}
            live={null}
          />
        </>
      )}
    </Dialog>
  );
}
