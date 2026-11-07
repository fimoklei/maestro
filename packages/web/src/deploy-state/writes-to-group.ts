import type { GroupedListGroup } from "../ui/grouped-list";
import { notWrittenNote, WRITES_TO } from "./deploy-state-copy";
import { toolDisplayName } from "./tool-presentation";
import type { GlobalFolderRef } from "./written-to-copy";

/** A Global dialog's `Writes to` list: every Global folder by path, one it skips muted. */
export function writesToGroup(
  folders: readonly GlobalFolderRef[],
): GroupedListGroup {
  return {
    tone: "neutral",
    legend: WRITES_TO,
    rows: folders.map((folder) => ({
      key: folder.path,
      name: folder.path,
      machineName: true,
      ...(folder.detected
        ? {}
        : {
            muted: true,
            sentence: notWrittenNote(toolDisplayName(folder.tool)),
          }),
    })),
  };
}
