import { CategoryField } from "../categories/category-field";
import { Field } from "../ui/field";
import { PromptBodyFields } from "./prompt-body-fields";
import type { ImportPromptsFlow } from "./use-import-prompts-flow";

// Paste text's fields: Name, Description, Category, then the text.
export function PastedPromptFields({
  pasted,
  disabled,
}: {
  pasted: ImportPromptsFlow["pasted"];
  /** Locked while the import runs. */
  disabled: boolean;
}) {
  const { draft, fieldErrors, edit } = pasted;
  return (
    <>
      <Field
        label="Name"
        error={fieldErrors.name}
        value={draft.name}
        onChange={(name) => edit({ name })}
        onBlur={pasted.leaveName}
        disabled={disabled}
        mono
      />
      <PromptBodyFields
        draft={draft}
        fieldErrors={fieldErrors}
        part={pasted.part}
        showPart={pasted.showPart}
        edit={edit}
        paste={pasted.paste}
        category={
          pasted.category === null ? null : (
            <CategoryField {...pasted.category} disabled={disabled} />
          )
        }
        disabled={disabled}
      />
    </>
  );
}
