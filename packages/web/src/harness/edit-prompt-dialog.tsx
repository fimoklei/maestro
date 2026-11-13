import type { PromptFile, PromptPart } from "@maestro/core/prompt-file";
import { CategoryField } from "../categories/category-field";
import type { HeldCategoryAdd } from "../categories/use-held-category-add";
import { EDIT_PROMPT } from "../ui/control-labels";
import { Dialog, dialogRun } from "../ui/dialog";
import { Fact } from "../ui/fact";
import type { NoticeContent } from "../ui/notice";
import { PromptBodyFields } from "./prompt-body-fields";
import { editPromptTitle } from "./prompt-copy";
import type { PromptFieldErrors } from "./prompt-field-errors";

// A prompt the reader chose: its name is a fact, its fields come filled.
export function EditPromptDialog({
  draft,
  fieldErrors,
  changed,
  phase,
  outcome,
  failure,
  part,
  showPart,
  edit,
  submit,
  close,
  unavailable,
  category,
  pickCategory,
  categoryAdd,
}: {
  draft: PromptFile & { name: string };
  fieldErrors: PromptFieldErrors;
  changed: boolean;
  phase: "idle" | "running";
  /** The write landed and its category did not: only Close is left. */
  outcome: boolean;
  failure: NoticeContent | null;
  /** Which text the one box holds. */
  part: PromptPart;
  showPart: (part: PromptPart) => void;
  edit: (change: Partial<PromptFile>) => void;
  submit: () => void;
  close: () => void;
  /** Why Edit prompt is blocked; null once a field changed. */
  unavailable: string | null;
  /** Undefined until the categories are read; null for No category. */
  category: string | null | undefined;
  pickCategory: (name: string | null) => void;
  categoryAdd: HeldCategoryAdd;
}) {
  const running = phase === "running";
  // Once the write landed without its category, only Close is left.
  const locked = running || outcome;
  return (
    <Dialog
      title={editPromptTitle(draft.name)}
      version={null}
      width={480}
      {...dialogRun({
        source: outcome
          ? null
          : {
              label: EDIT_PROMPT,
              verb: "edit",
              tone: "primary",
              unavailable,
              onRun: submit,
            },
        running,
        outcome,
      })}
      failure={failure}
      // Every field states its own hint and its own refusal beside it.
      describedBy={null}
      fieldsChanged={changed}
      onClose={close}
    >
      <dl className="m-0">
        <Fact label="Name" value={draft.name} wrap machine={false} />
      </dl>
      <PromptBodyFields
        draft={draft}
        fieldErrors={fieldErrors}
        part={part}
        showPart={showPart}
        edit={edit}
        paste={null}
        category={
          category === undefined ? null : (
            <CategoryField
              value={category}
              onChange={pickCategory}
              suggested={null}
              add={categoryAdd}
              disabled={locked}
            />
          )
        }
        disabled={locked}
      />
    </Dialog>
  );
}
