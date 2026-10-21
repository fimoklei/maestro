import type { PromptDraft } from "@maestro/core/prompt-file";
import type { ClipboardEvent } from "react";
import { IMPORT_PROMPT } from "../ui/control-labels";
import { Dialog } from "../ui/dialog";
import { Field } from "../ui/field";
import type { NoticeContent } from "../ui/notice";
import { TextAreaField } from "../ui/text-area-field";
import { PROMPT_FIELD_HINTS } from "./import-prompt-copy";
import type { PromptFieldErrors } from "./use-import-prompt-flow";

export function ImportPromptDialog({
  draft,
  fieldErrors,
  changed,
  importing,
  failure,
  onEdit,
  onPaste,
  onImport,
  onClose,
}: {
  draft: PromptDraft;
  fieldErrors: PromptFieldErrors;
  changed: boolean;
  importing: boolean;
  failure: NoticeContent | null;
  onEdit: (change: Partial<PromptDraft>) => void;
  /** The text as it reads after the paste; true when the paste was taken over. */
  onPaste: (next: string) => boolean;
  onImport: () => void;
  onClose: () => void;
}) {
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
      title="Import a prompt"
      version={null}
      width={480}
      phase={importing ? "running" : "idle"}
      action={{
        label: IMPORT_PROMPT,
        verb: "import",
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
      <Field
        label="Name"
        hint={PROMPT_FIELD_HINTS.name}
        error={fieldErrors.name}
        value={draft.name}
        onChange={(name) => onEdit({ name })}
        disabled={importing}
        mono
      />
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
