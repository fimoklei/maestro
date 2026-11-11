import { ImportPromptsDialog } from "./import-prompts-dialog";
import { useImportPromptsFlow } from "./use-import-prompts-flow";

// Import prompts, mounted only while its dialog stands.
export function ImportPromptsAction({ onClose }: { onClose: () => void }) {
  return <ImportPromptsDialog {...useImportPromptsFlow(onClose)} />;
}
