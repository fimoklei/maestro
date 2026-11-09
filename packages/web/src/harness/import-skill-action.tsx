import { useFolderChooser } from "../ui/use-folder-chooser";
import type { ScreenWrites } from "../ui/use-write-action";
import { ImportDialog } from "./import-dialog";
import { importNotice } from "./import-notice-copy";
import type { ImportCheckLoad } from "./import-view-model";
import type { useImportCheck } from "./use-harness";
import { useImportFlow } from "./use-import-flow";

// Import skill, mounted only while its dialog stands.
export function ImportSkillAction({
  screen,
  onImported,
  onClose,
}: {
  screen: ScreenWrites;
  /** Opens the imported row's pane. */
  onImported: (row: string) => void;
  onClose: () => void;
}) {
  const flow = useImportFlow(screen, onImported, onClose);
  const chooser = useFolderChooser();
  return (
    <ImportDialog
      chooser={chooser}
      source={flow.source}
      sourceText={flow.sourceText}
      sourceError={flow.sourceError}
      onSourceChange={flow.setSourceText}
      onSourceCommit={flow.commitSource}
      name={flow.name}
      load={importLoad(flow.source, flow.check)}
      onNameChange={flow.setEditedName}
      onClose={flow.close}
      onImport={flow.submit}
      importing={flow.importing}
      importError={flow.importError}
      outcome={flow.outcome}
      category={flow.category.field}
    />
  );
}

// Idle until a folder is picked: with nothing to judge there is no refusal to
// state, and "loading" would claim a request that was never made.
function importLoad(
  source: string | null,
  check: ReturnType<typeof useImportCheck>,
): ImportCheckLoad {
  if (source === null) {
    return { kind: "idle" };
  }
  if (check.data !== undefined) {
    return { kind: "ready", check: check.data };
  }
  const failed = importNotice(check.error);
  if (failed !== null) {
    return { kind: "error", notice: failed };
  }
  return { kind: "loading" };
}
