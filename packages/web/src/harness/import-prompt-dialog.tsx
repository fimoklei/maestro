import type { ImportMode } from "@maestro/core";
import type { PromptFile } from "@maestro/core/prompt-file";
import { FileText } from "lucide-react";
import { type ClipboardEvent, useId, useRef } from "react";
import { CategoryField } from "../categories/category-field";
import { Button } from "../ui/button";
import { CHOOSE_ANOTHER_FILE, EDIT_PROMPT } from "../ui/control-labels";
import { Dialog, dialogRun } from "../ui/dialog";
import { Fact } from "../ui/fact";
import { Field } from "../ui/field";
import { Icon } from "../ui/icon";
import { MachineValue } from "../ui/machine-value";
import { Notice, type NoticeContent } from "../ui/notice";
import { SegmentedControl } from "../ui/segmented-control";
import { TextAreaField } from "../ui/text-area-field";
import {
  CHOOSE_FILE_HINT,
  editPromptTitle,
  fileSize,
  PROMPT_FIELD_HINTS,
  PROMPT_IMPORT_MODES,
  PROMPT_SOURCE_LABEL,
  PROMPT_SOURCES,
  type PromptSource,
} from "./import-prompt-copy";
import type { PromptFieldErrors } from "./prompt-field-errors";
import type { ImportPromptFlow } from "./use-import-prompt-flow";

// What both modes read: the two fields every prompt has, and the run.
type PromptDialogBase = {
  draft: PromptFile & { name: string };
  fieldErrors: PromptFieldErrors;
  changed: boolean;
  phase: "idle" | "running";
  failure: NoticeContent | null;
  edit: (change: Partial<PromptFile>) => void;
  submit: () => void;
  close: () => void;
};

// The flow's slice the dialog reads; the Harness screen passes the flow itself.
type ImportProps = PromptDialogBase & { mode: ImportMode } & Pick<
    ImportPromptFlow,
    | "draft"
    | "edit"
    | "takenNotice"
    | "source"
    | "setSource"
    | "chosenFile"
    | "fileNotice"
    | "chooseFile"
    | "checkName"
    | "paste"
  >;

// A prompt the reader chose: its name is a fact, its fields come filled.
type EditProps = PromptDialogBase & {
  mode: "edit";
  /** Why Edit prompt is blocked; null once a field changed. */
  unavailable: string | null;
  /** Undefined until the categories are read; null for No category. */
  category: string | null | undefined;
  pickCategory: (name: string | null) => void;
  /** The edit landed and its category did not: only Close is left. */
  outcome: boolean;
};

type ImportPromptDialogProps = ImportProps | EditProps;

export function ImportPromptDialog(props: ImportPromptDialogProps) {
  const { draft, fieldErrors, changed, phase, failure, edit, submit, close } =
    props;
  const takenNoticeId = useId();
  const hintId = useId();
  const fileInput = useRef<HTMLInputElement>(null);
  const importing = phase === "running";
  const { title, confirm, verb, unavailable } =
    props.mode === "edit"
      ? {
          title: editPromptTitle(draft.name),
          confirm: EDIT_PROMPT,
          verb: "edit" as const,
          unavailable: props.unavailable,
        }
      : { ...PROMPT_IMPORT_MODES[props.mode], unavailable: null };
  const importOnly = props.mode === "edit" ? null : props;
  const editOnly = props.mode === "edit" ? props : null;
  // Once the edit landed, only Close is left.
  const locked = importing || editOnly?.outcome === true;
  // Choose file opens the browser's file chooser at once, again on each press.
  const pickSource = (next: PromptSource) => {
    importOnly?.setSource(next);
    if (next === "file") fileInput.current?.click();
  };
  const pasteText = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (
      importOnly?.paste(
        event.currentTarget,
        event.clipboardData.getData("text/plain"),
      )
    ) {
      event.preventDefault();
    }
  };

  return (
    <Dialog
      title={title}
      version={null}
      width={480}
      {...dialogRun({
        source:
          editOnly?.outcome === true
            ? null
            : {
                label: confirm,
                verb,
                tone: "primary",
                unavailable,
                onRun: submit,
              },
        running: importing,
        outcome: editOnly?.outcome === true,
      })}
      failure={failure}
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      fieldsChanged={changed}
      onClose={close}
    >
      {importOnly === null ? (
        <>
          <dl className="m-0">
            <Fact label="Name" value={draft.name} wrap machine={false} />
          </dl>
          {editOnly === null || editOnly.category === undefined ? null : (
            <CategoryField
              value={editOnly.category}
              onChange={editOnly.pickCategory}
              disabled={locked}
            />
          )}
        </>
      ) : (
        <>
          <SegmentedControl
            label={PROMPT_SOURCE_LABEL}
            segments={PROMPT_SOURCES}
            value={importOnly.source}
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
              if (file !== undefined) importOnly.chooseFile(file);
            }}
          />
          {importOnly.source === "file" ? (
            <div className="flex flex-col gap-tight">
              <span id={hintId} className="font-ui text-meta text-gray-11">
                {CHOOSE_FILE_HINT}
              </span>
              {importOnly.chosenFile === null ? null : (
                <div className="flex h-10 items-center justify-between gap-inline rounded-control border border-edge bg-gray-1 pr-1 pl-cell">
                  <span className="flex min-w-0 items-center gap-inline text-meta">
                    <Icon of={FileText} className="shrink-0 text-gray-11" />
                    <span className="truncate text-gray-12">
                      <MachineValue>{importOnly.chosenFile.name}</MachineValue>
                    </span>{" "}
                    <span className="shrink-0 text-gray-11">
                      · {fileSize(importOnly.chosenFile.bytes)}
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
              <Notice trigger="user-action" notice={importOnly.fileNotice} />
            </div>
          ) : null}
          <div className="flex flex-col gap-inline">
            <Field
              label="Name"
              hint={PROMPT_FIELD_HINTS.name}
              error={fieldErrors.name}
              value={draft.name}
              onChange={(name) => importOnly.edit({ name })}
              onBlur={importOnly.checkName}
              describedBy={
                importOnly.takenNotice === null ? undefined : takenNoticeId
              }
              disabled={importing}
              mono
            />
            <Notice
              id={takenNoticeId}
              trigger="user-action"
              notice={importOnly.takenNotice}
            />
          </div>
        </>
      )}
      <Field
        label="Description"
        hint={PROMPT_FIELD_HINTS.description}
        error={fieldErrors.description}
        value={draft.description}
        onChange={(description) => edit({ description })}
        disabled={locked}
      />
      <TextAreaField
        label="Prompt text"
        hint={PROMPT_FIELD_HINTS.text}
        error={fieldErrors.text}
        value={draft.text}
        onChange={(text) => edit({ text })}
        onPaste={importOnly === null ? undefined : pasteText}
        disabled={locked}
      />
    </Dialog>
  );
}
