import type {
  PromptDraft,
  PromptFieldProblem,
} from "@maestro/core/prompt-file";
import { isFieldError, PROMPT_FIELD_ERRORS } from "./import-prompt-copy";

const PROBLEM_FIELD: Record<
  keyof typeof PROMPT_FIELD_ERRORS,
  keyof PromptDraft
> = {
  "empty-name": "name",
  "invalid-name": "name",
  "empty-description": "description",
  "multiline-description": "description",
  "long-description": "description",
  "empty-text": "text",
};

export type PromptFieldErrors = Partial<Record<keyof PromptDraft, string>>;

/** Each field's first broken rule, as its error line states it. */
export function promptFieldErrors(
  problems: readonly PromptFieldProblem[],
): PromptFieldErrors {
  const errors: PromptFieldErrors = {};
  for (const problem of problems) {
    if (!isFieldError(problem)) continue;
    errors[PROBLEM_FIELD[problem]] ??= PROMPT_FIELD_ERRORS[problem];
  }
  return errors;
}
