import type { BrowseError } from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";

const browseHeadings: NoticeTable<BrowseError> = {
  "outside-root": {
    level: "error",
    label: "Out of reach",
    message: "Pick a folder inside your home folder.",
    detail: "Maestro browses inside the home folder only.",
  },
  "not-found": {
    level: "error",
    label: "No folder at that path",
    message: "Pick another folder.",
    detail: "It may have been moved or deleted since the last look.",
  },
  "not-a-directory": {
    level: "error",
    label: "Not a folder",
    message: "That path points at a file. Pick the folder that holds it.",
  },
  unreadable: {
    level: "error",
    label: "Folder unreadable",
    message: "Pick another folder.",
    detail: "Its permissions do not allow reading.",
  },
};

// The fallback for a failure no row covers: the browser stays on the folder it
// last read, so the sentence sends the user back to the picker (#688).
export function browseNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(browseHeadings, error, {
    label: "Folder not read",
    message: "The Maestro server did not answer. Pick the folder again.",
  });
}
