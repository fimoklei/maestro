import type { PromptDraft } from "@maestro/core/prompt-file";
import { type ClipboardEvent, useId } from "react";
import { IMPORT_PROMPT, UPDATE_PROMPT } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import { Notice, type NoticeContent } from "../ui/notice";
import { TextAreaField } from "../ui/text-area-field";
import { PROMPT_FIELD_HINTS } from "./import-prompt-copy";
import type { PromptFieldErrors } from "./use-import-prompt-flow";

export function ImportPromptDialog({
  draft,
  fieldErrors,
  changed,
  importing,
  failure,
  updating,
  takenNotice,
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
  onEdit: (change: Partial<PromptDraft>) => void;
  onNameLeave: () => void;
  /** The text as it reads after the paste; true when the paste was taken over. */
  onPaste: (next: string) => boolean;
  onImport: () => void;
  onClose: () => void;
}) {
  const takenNoticeId = useId();
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
