import { FileText } from "lucide-react";
import { type ClipboardEvent, useId, useRef } from "react";
import { Button } from "../ui/button";
import { CHOOSE_ANOTHER_FILE } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Icon } from "../ui/icon";
import { MachineValue } from "../ui/machine-value";
import { Notice } from "../ui/notice";
import { SegmentedControl } from "../ui/segmented-control";
import { TextAreaField } from "../ui/text-area-field";
import {
  CHOOSE_FILE_HINT,
  fileSize,
  PROMPT_FIELD_HINTS,
  PROMPT_IMPORT_MODES,
  PROMPT_SOURCE_LABEL,
  PROMPT_SOURCES,
  type PromptSource,
} from "./import-prompt-copy";
import type { ImportPromptFlow } from "./use-import-prompt-flow";

// The flow's slice the dialog reads; the Harness screen passes the flow itself.
type ImportPromptDialogProps = Pick<
  ImportPromptFlow,
  | "draft"
  | "fieldErrors"
  | "changed"
  | "phase"
  | "failure"
  | "mode"
  | "takenNotice"
  | "source"
  | "setSource"
  | "chosenFile"
  | "fileNotice"
  | "chooseFile"
  | "edit"
  | "checkName"
  | "paste"
  | "submit"
  | "close"
>;

export function ImportPromptDialog({
  draft,
  fieldErrors,
  changed,
  phase,
  failure,
  mode,
  takenNotice,
  source,
  setSource,
  chosenFile,
  fileNotice,
  chooseFile,
  edit,
  checkName,
  paste,
  submit,
  close,
}: ImportPromptDialogProps) {
  const takenNoticeId = useId();
  const hintId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const importing = phase === "running";
  const { title, confirm, verb } = PROMPT_IMPORT_MODES[mode];
  // Choose file opens the browser's file chooser at once, again on each press.
  const pickSource = (next: PromptSource) => {
    setSource(next);
    if (next === "file") fileInput.current?.click();
  };
  const pasteText = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (paste(event.currentTarget, event.clipboardData.getData("text/plain"))) {
      event.preventDefault();
    }
  };

  return (
    <Dialog
      title={title}
      version={null}
      width={480}
      phase={importing ? "running" : "idle"}
      action={{
        label: confirm,
        verb,
        tone: "primary",
        unavailable: null,
        onRun: submit,
      }}
      failure={failure}
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      fieldsChanged={changed}
      onClose={close}
    >
      <SegmentedControl
        label={PROMPT_SOURCE_LABEL}
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
          if (file !== undefined) chooseFile(file);
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
          onChange={(name) => edit({ name })}
          onBlur={checkName}
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
        onChange={(description) => edit({ description })}
        disabled={importing}
      />
      <TextAreaField
        label="Prompt text"
        hint={PROMPT_FIELD_HINTS.text}
        error={fieldErrors.text}
        value={draft.text}
        onChange={(text) => edit({ text })}
        onPaste={pasteText}
        disabled={importing}
      />
    </Dialog>
  );
}
