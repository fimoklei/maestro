import type { ScreenWrites, WriteResult } from "../ui/use-write-action";
import { EditPromptDialog } from "./edit-prompt-dialog";
import type { EditScreen } from "./prompt-copy";
import { type OpenedPrompt, useEditPromptFlow } from "./use-edit-prompt-flow";

// Edit prompt, mounted only while its dialog stands, on the prompt the
// screen's read opened.
export function EditPromptAction(props: {
  opened: OpenedPrompt;
  /** The screen the edit starts on. */
  screen: EditScreen;
  /** Its table screen's writes. */
  writes: ScreenWrites;
  /** Takes the result to the Harness view, where the edited row is. */
  onEdited: (name: string, written: WriteResult) => void;
  onClose: () => void;
}) {
  return <EditPromptDialog {...useEditPromptFlow(props)} />;
}
