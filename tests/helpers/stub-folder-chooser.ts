// Shared test helper: a ChooseFolder with no chooser, for tests that exercise
// other routes but must satisfy createApp's folderChooser dependency. The route
// itself is covered in tests/integration/server-folder-chooser.
import { ChooseFolder, NodeFileSystem } from "@maestro/core";

export function stubFolderChooser(): ChooseFolder {
  return new ChooseFolder({
    chooser: null,
    fs: new NodeFileSystem(),
    homeRoot: () => "/nonexistent-maestro-home",
  });
}
