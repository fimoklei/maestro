import { COPY_PROMPT } from "../ui/control-labels";
import { named, phrase } from "../ui/phrase";
import { CLEAR_FILTERS } from "../ui/view-options-copy";

// The Prompts band 2 and table (#1598).
export const SEARCH_LABEL = "Search Prompts";
export const PROMPTS_FACT = "Prompts";
/** The Prompts fact: `X of N` once a search or filter hides a prompt. */
export const promptsFactValue = (shown: number, total: number): string =>
  shown === total ? `${total}` : `${shown} of ${total}`;

// Empty is an offer, not a failure: the action opens where prompts are made.
export const NO_RELEASED_PROMPTS = {
  title: "No released prompts yet",
  description: "Prompts from the latest release appear here.",
};
export const NO_SEARCH_MATCH = {
  title: "No prompts match the search",
  description: "Clear the search box to see every prompt.",
};
export const NO_FILTER_MATCH = {
  title: "No prompts match the filters",
  description: `Select ${CLEAR_FILTERS} to see every prompt.`,
};

// The finding on a badly named prompt file: the Filter's section, the hover
// card and the pane's warning (#1590).
export const FINDING_LABEL = "Finding";
export const NAME_NOT_VALID = "Name not valid";
export const NAME_RULE = phrase`A prompt name uses lowercase letters, digits and single hyphens, like ${named("pr-review")}.`;
export const nameNotValidNotice = (name: string) => ({
  label: "Prompt name not valid",
  message: phrase`Rename ${named(name)} in your clone. Use lowercase letters, digits and single hyphens, like ${named("pr-review")}. ${COPY_PROMPT} still works.`,
});

// The detail pane (#1598).
export const PATH_FACT = "Path";
export const PROMPT_TEXT_HEADING = "Prompt";
export const COPY_PROMPT_TEXT = "Copy prompt text";

// Copy prompt's refusal; its success is the shared done sentence in a toast.
export const NOT_COPIED = {
  label: "Prompt not copied",
  message:
    "The browser blocked the clipboard. Highlight the text in the Prompt box. Then copy it yourself.",
};
