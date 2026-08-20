import type {
  ConnectInventoryError,
  ScaffoldHarnessError,
} from "@maestro/core";
import type { NoticeContent } from "../ui/notice";
import {
  type NoticeExtras,
  type NoticeTable,
  noticeFromTable,
} from "../ui/notice-table";

const connectHeadings: NoticeTable<ConnectInventoryError> = {
  missing: { level: "error", label: "no path given" },
  relative: { level: "error", label: "path is not absolute" },
  "not-found": { level: "error", label: "no folder at that path" },
  "not-a-directory": { level: "error", label: "not a folder" },
  "not-a-github-url": { level: "error", label: "not a GitHub URL" },
  "url-carries-credentials": {
    level: "error",
    label: "URL carries credentials",
  },
  "invalid-parent": { level: "error", label: "not a folder to clone into" },
  "destination-occupied": {
    level: "error",
    label: "destination folder is taken",
  },
  "destination-partial-clone": {
    level: "error",
    label: "half-finished clone in the way",
  },
  "clone-in-progress": {
    level: "error",
    label: "that clone is already running",
  },
  "clone-auth-failed": { level: "error", label: "GitHub sign-in failed" },
  "clone-unavailable": { level: "error", label: "repository not available" },
  "clone-failed": { level: "error", label: "the clone did not finish" },
  "not-an-inventory": { level: "error", label: "not a Harness" },
  // An offer, not a fault: the path is fine, it just has no Harness in it yet.
  scaffoldable: { level: "info", label: "not a Harness yet" },
  "no-usable-origin": { level: "error", label: "no usable git origin" },
  "no-default-branch": { level: "error", label: "no default branch" },
};

const scaffoldHeadings: NoticeTable<ScaffoldHarnessError> = {
  missing: { level: "error", label: "no path given" },
  relative: { level: "error", label: "path is not absolute" },
  "not-found": { level: "error", label: "no folder at that path" },
  "not-a-directory": { level: "error", label: "not a folder" },
  "not-offered": { level: "error", label: "the offer has expired" },
  "not-a-repository": { level: "error", label: "not a git repository" },
  "already-a-harness": { level: "error", label: "already a Harness" },
  "path-occupied": { level: "error", label: "files already in the way" },
  "no-default-branch": { level: "error", label: "no default branch" },
  "not-on-default-branch": {
    level: "error",
    label: "not on the default branch",
  },
  busy: { level: "error", label: "a scaffold is already running" },
  "write-failed": { level: "error", label: "nothing was written" },
  "commit-failed": { level: "error", label: "the commit failed" },
  "push-rejected": { level: "error", label: "GitHub refused the push" },
  "push-offline": { level: "error", label: "GitHub could not be reached" },
  "connect-failed": { level: "error", label: "scaffolded but not connected" },
};

export function connectNotice(
  error: unknown,
  extras: NoticeExtras = {},
): NoticeContent | null {
  return noticeFromTable(connectHeadings, error, "the connect failed", extras);
}

export function scaffoldNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(scaffoldHeadings, error, "the scaffold failed");
}
