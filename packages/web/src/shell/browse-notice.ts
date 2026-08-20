import type { BrowseError } from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import { type NoticeTable, noticeFromTable } from "../ui/notice-table";

const browseHeadings: NoticeTable<BrowseError> = {
  "outside-root": { level: "error", label: "outside the browsable area" },
  "not-found": { level: "error", label: "no folder at that path" },
  "not-a-directory": { level: "error", label: "not a folder" },
  unreadable: { level: "error", label: "folder could not be read" },
};

export function browseNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(browseHeadings, error, "the folder did not load");
}
