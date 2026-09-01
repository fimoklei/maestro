import type { BrowseError } from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";

const browseHeadings: NoticeTable<BrowseError> = {
  "outside-root": {
    level: "error",
    label: "outside the browsable area",
    message: "Maestro browses inside the home folder only. Pick one under it.",
  },
  "not-found": {
    level: "error",
    label: "no folder at that path",
    message:
      "It may have been moved or deleted since the last look. Pick another folder.",
  },
  "not-a-directory": {
    level: "error",
    label: "not a folder",
    message: "That path points at a file. Pick the folder that holds it.",
  },
  unreadable: {
    level: "error",
    label: "folder could not be read",
    message: "Its permissions do not allow reading. Pick another folder.",
  },
};

// The fallback for a failure no row covers: the browser stays on the folder it
// last read, so the sentence sends the user back to the picker (#688).
export function browseNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(browseHeadings, error, {
    label: "Folder not loaded",
    message:
      "The Maestro server did not answer, so this folder is still unread. Pick it again.",
  });
}
