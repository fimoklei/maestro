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

export function browseNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(browseHeadings, error, "the folder did not load");
}
