import type { ChooseFolderError } from "@maestro/core";
import type { NoticeContent } from "./notice";
import { type NoticeTable, noticeFromTable } from "./notice-table";

const chooserHeadings: NoticeTable<ChooseFolderError> = {
  "chooser-failed": {
    level: "error",
    label: "Folder chooser didn't work",
    message: "The field didn't change. Type or paste the folder path.",
  },
  "chooser-busy": {
    level: "error",
    label: "Folder chooser already open",
    message: "The field didn't change. Choose the folder in the open chooser.",
  },
  "chooser-unavailable": {
    level: "error",
    label: "No folder chooser on this computer",
    message: "The field didn't change. Type or paste the folder path.",
  },
};

export function chooserNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(chooserHeadings, error, {
    label: "Folder chooser didn't open",
    message:
      "The field didn't change. Select Browse to try again, or type the folder path.",
  });
}
