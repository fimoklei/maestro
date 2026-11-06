import type { GlobalFolderState } from "@maestro/core";
import { cn } from "../ui/cn";
import { MachineValue } from "../ui/machine-value";
import { notWrittenNote, WRITES_TO } from "./deploy-state-copy";
import { toolDisplayName } from "./tool-presentation";

export type WritesToFolder = Pick<
  GlobalFolderState,
  "path" | "tool" | "detected"
>;

/** The Global folders a dialog's action writes; a folder of an undetected tool reads muted. */
export function WritesToList({
  folders,
}: {
  folders: readonly WritesToFolder[];
}) {
  return (
    <ul aria-label={WRITES_TO} className="m-0 flex list-none flex-col p-0">
      {folders.map((folder) => (
        <li
          key={folder.path}
          className={cn(
            "flex min-h-row min-w-0 items-center text-row",
            folder.detected ? "text-gray-12" : "text-gray-11",
          )}
        >
          <span className="truncate">
            <MachineValue>{folder.path}</MachineValue>
            {folder.detected ? null : (
              <> · {notWrittenNote(toolDisplayName(folder.tool))}</>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
}
