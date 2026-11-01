import type { PromptFile } from "@maestro/core/prompt-file";

/** The prompt as a browser text field holds it: LF only. */
export const asTyped = (prompt: PromptFile): PromptFile => ({
  ...prompt,
  text: prompt.text.replace(/\r\n?/g, "\n"),
});
