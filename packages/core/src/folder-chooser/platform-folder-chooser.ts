import type { FolderChooserPort } from "./folder-chooser-port";
import { MacosFolderChooser } from "./macos-folder-chooser";
import { WindowsFolderChooser } from "./windows-folder-chooser";

/** The chooser for this platform; null where no helper is admitted. */
export function platformFolderChooser(
  platform: NodeJS.Platform,
): FolderChooserPort | null {
  if (platform === "darwin") return new MacosFolderChooser();
  if (platform === "win32") return new WindowsFolderChooser();
  return null;
}
