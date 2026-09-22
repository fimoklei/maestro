import type { ChooseFolderError } from "@maestro/core";
import type { NoticeContent } from "./notice";
import { type NoticeTable, noticeFromTable } from "./notice-table";

const chooserHeadings: NoticeTable<ChooseFolderError> = {
  "chooser-failed": {
    level: "error",
    label: "Folder chooser did not work",
    message: "The field did not change. Type or paste the folder path.",
  },
  "chooser-busy": {
    level: "error",
    label: "Folder chooser already open",
    message: "The field did not change. Pick the folder in the open chooser.",
  },
  "chooser-unavailable": {
    level: "error",
    label: "No folder chooser on this computer",
    message: "The field did not change. Type or paste the folder path.",
  },
};

export function chooserNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(chooserHeadings, error, {
    label: "Folder chooser did not open",
    message:
      "The field did not change. Select Browse to try again, or type the folder path.",
  });
}
