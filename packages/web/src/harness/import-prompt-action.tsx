import type { ScreenWrites } from "../ui/use-write-action";
import { ImportPromptDialog } from "./import-prompt-dialog";
import { useImportPromptFlow } from "./use-import-prompt-flow";

// Import prompt, mounted only while its dialog stands.
export function ImportPromptAction({
  screen,
  onImported,
  onClose,
}: {
  screen: ScreenWrites;
  /** Opens the imported row's pane. */
  onImported: (row: string) => void;
  onClose: () => void;
}) {
  return (
    <ImportPromptDialog {...useImportPromptFlow(screen, onImported, onClose)} />
  );
}
