import type { PromptFile, PromptPart } from "@maestro/core/prompt-file";
import type { ClipboardEvent, ReactNode } from "react";
import { Field } from "../ui/field";
import { SegmentedControl } from "../ui/segmented-control";
import { TextAreaField } from "../ui/text-area-field";
import {
  EXAMPLE_HINT,
  PROMPT_BOX_LABEL,
  PROMPT_BOX_PARTS,
  PROMPT_BOX_WORDS,
} from "./prompt-copy";
import type { PromptFieldErrors } from "./prompt-field-errors";
import type { PasteTarget } from "./use-pasted-prompt";

/**
 * A prompt's Description, its Category, then one box for the prompt text or
 * the example, as Paste text and Edit prompt both draw them.
 */
export function PromptBodyFields({
  draft,
  fieldErrors,
  part,
  showPart,
  edit,
  paste,
  category,
  disabled,
}: {
  draft: PromptFile;
  fieldErrors: PromptFieldErrors;
  /** Which text the one box holds. */
  part: PromptPart;
  showPart: (part: PromptPart) => void;
  edit: (change: Partial<PromptFile>) => void;
  /** Takes over a paste into the prompt text; false leaves it to the box. Null takes none. */
  paste: ((field: PasteTarget, pasted: string) => boolean) | null;
  /** The Category field; null while the categories are unread. */
  category: ReactNode;
  disabled: boolean;
}) {
  const pasteText = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    if (
      paste?.(event.currentTarget, event.clipboardData.getData("text/plain"))
    ) {
      event.preventDefault();
    }
  };
  return (
    <>
      <Field
        label="Description"
        error={fieldErrors.description}
        value={draft.description}
        onChange={(description) => edit({ description })}
        disabled={disabled}
      />
      {category}
      <TextAreaField
        label={{
          name: PROMPT_BOX_WORDS[part],
          control: (
            <SegmentedControl
              label={PROMPT_BOX_LABEL}
              segments={PROMPT_BOX_PARTS}
              value={part}
              onChange={showPart}
              className="self-start"
            />
          ),
        }}
        hint={part === "example" ? EXAMPLE_HINT : undefined}
        error={part === "text" ? fieldErrors.text : undefined}
        value={draft[part]}
        onChange={(value) => edit({ [part]: value })}
        // A pasted file drafts the fields from the prompt text only.
        onPaste={part === "text" && paste !== null ? pasteText : undefined}
        disabled={disabled}
      />
    </>
  );
}
