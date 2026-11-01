import { exampleOf, type PromptFile } from "@maestro/core/prompt-file";

const lf = (value: string) => value.replace(/\r\n?/g, "\n");

/** The prompt as a browser text field holds it, LF only; a blank example is none. */
export const asTyped = (prompt: PromptFile): PromptFile => ({
  ...prompt,
  text: lf(prompt.text),
  example: exampleOf(lf(prompt.example)),
});
