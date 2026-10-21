import type { PromptDraft } from "@maestro/core/prompt-file";
import { FileText } from "lucide-react";
import { type ClipboardEvent, useId, useRef } from "react";
import { Button } from "../ui/button";
import {
  CHOOSE_ANOTHER_FILE,
  IMPORT_PROMPT,
  UPDATE_PROMPT,
} from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Icon } from "../ui/icon";
import { MachineValue } from "../ui/machine-value";
import { Notice, type NoticeContent } from "../ui/notice";
import { SegmentedControl } from "../ui/segmented-control";
import { TextAreaField } from "../ui/text-area-field";
import {
  CHOOSE_FILE_HINT,
  fileSize,
  PROMPT_FIELD_HINTS,
  PROMPT_SOURCES,
  type PromptSource,
} from "./import-prompt-copy";
import type { ChosenFile, PromptFieldErrors } from "./use-import-prompt-flow";

export function ImportPromptDialog({
  draft,
  fieldErrors,
  changed,
  importing,
  failure,
  updating,
  takenNotice,
  source,
  chosenFile,
  fileNotice,
  onSource,
  onFile,
  onEdit,
  onNameLeave,
  onPaste,
  onImport,
  onClose,
}: {
  draft: PromptDraft;
  fieldErrors: PromptFieldErrors;
  changed: boolean;
  importing: boolean;
  failure: NoticeContent | null;
  /** The name is taken: the submit replaces that prompt. */
  updating: boolean;
  takenNotice: NoticeContent | null;
  source: PromptSource;
  chosenFile: ChosenFile | null;
  /** The chosen file is refused. */
  fileNotice: NoticeContent | null;
  onSource: (source: PromptSource) => void;
  onFile: (file: File) => void;
  onEdit: (change: Partial<PromptDraft>) => void;
  onNameLeave: () => void;
  /** The text as it reads after the paste; true when the paste was taken over. */
  onPaste: (next: string) => boolean;
  onImport: () => void;
  onClose: () => void;
}) {
  const takenNoticeId = useId();
  const hintId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  // Choose file opens the browser's file chooser at once, again on each press.
  const pickSource = (next: PromptSource) => {
    onSource(next);
    if (next === "file") fileInput.current?.click();
  };
  const pasteText = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const area = event.currentTarget;
    const next =
      area.value.slice(0, area.selectionStart) +
      event.clipboardData.getData("text/plain") +
      area.value.slice(area.selectionEnd);
    if (onPaste(next)) event.preventDefault();
  };

  return (
    <Dialog
      title={updating ? "Update a prompt" : "Import a prompt"}
      version={null}
      width={480}
      phase={importing ? "running" : "idle"}
      action={{
        label: updating ? UPDATE_PROMPT : IMPORT_PROMPT,
        verb: updating ? "update" : "import",
        tone: "primary",
        unavailable: null,
        onRun: onImport,
      }}
      failure={failure}
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      fieldsChanged={changed}
      onClose={onClose}
    >
      <SegmentedControl
        label={null}
        segments={PROMPT_SOURCES}
        value={source}
        onChange={pickSource}
        className="self-start"
      />
      <input
        ref={fileInput}
        type="file"
        accept=".md,.txt"
        hidden
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          // Cleared, so choosing the same file again reads it again.
          event.currentTarget.value = "";
          if (file !== undefined) onFile(file);
        }}
      />
      {source === "file" ? (
        <div className="flex flex-col gap-tight">
          <span id={hintId} className="font-ui text-meta text-gray-11">
            {CHOOSE_FILE_HINT}
          </span>
          {chosenFile === null ? null : (
            <div className="flex h-10 items-center justify-between gap-inline rounded-control border border-edge bg-gray-1 pr-1 pl-cell">
              <span className="flex min-w-0 items-center gap-inline text-meta">
                <Icon of={FileText} className="shrink-0 text-gray-11" />
                <span className="truncate text-gray-12">
                  <MachineValue>{chosenFile.name}</MachineValue>
                </span>{" "}
                <span className="shrink-0 text-gray-11">
                  · {fileSize(chosenFile.bytes)}
                </span>
              </span>
              <Button
                type="button"
                variant="quiet"
                aria-describedby={hintId}
                disabled={importing}
                onClick={() => fileInput.current?.click()}
              >
                {CHOOSE_ANOTHER_FILE}
              </Button>
            </div>
          )}
          <Notice trigger="user-action" notice={fileNotice} />
        </div>
      ) : null}
      <div className="flex flex-col gap-inline">
        <Field
          label="Name"
          hint={PROMPT_FIELD_HINTS.name}
          error={fieldErrors.name}
          value={draft.name}
          onChange={(name) => onEdit({ name })}
          onBlur={onNameLeave}
          describedBy={takenNotice === null ? undefined : takenNoticeId}
          disabled={importing}
          mono
        />
        <Notice id={takenNoticeId} trigger="user-action" notice={takenNotice} />
      </div>
      <Field
        label="Description"
        hint={PROMPT_FIELD_HINTS.description}
        error={fieldErrors.description}
        value={draft.description}
        onChange={(description) => onEdit({ description })}
        disabled={importing}
      />
      <TextAreaField
        label="Prompt text"
        hint={PROMPT_FIELD_HINTS.text}
        error={fieldErrors.text}
        value={draft.text}
        onChange={(text) => onEdit({ text })}
        onPaste={pasteText}
        disabled={importing}
      />
    </Dialog>
  );
}
