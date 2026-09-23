import type { RegisterError, RepoStatus } from "@maestro/core";
import { HttpError } from "../api/http";
import type { NoticeContent } from "../ui/notice";
import {
  type NoticeTable,
  noticeFromTable,
  requestShapeNotice,
} from "../ui/notice-table";
import { reading, type StatusReading } from "../ui/status-reading";

// Every word the Repositories screen and its dialog show (ADR-0025, #1009).

export const SCREEN = "Repositories";
export const REGISTER_REPOSITORY = "Register repository";
export const REGISTER_TITLE = "Register a repository";
export const UNREGISTER = "Unregister";
export const VIEW_DEPLOY_STATE = "View Deploy-state";
export const REREAD_LABEL = "Re-read Repositories";
export const TABLE_LABEL = "Repositories table";
export const ACTIONS_COLUMN_LABEL = "Actions";
export const COLUMNS = {
  repository: "Repository",
  path: "Folder path",
  status: "Status",
} as const;

export const FOLDER_LABEL = "Folder path";
export const FOLDER_HINT = "Must be a Git repository.";

export const EMPTY_TITLE = "No repositories yet";
export const EMPTY_SENTENCE =
  "The repositories you deploy skills to appear here, with the state of each folder.";

export const STATUS_READINGS: Record<RepoStatus, StatusReading> = {
  ready: reading("Ready", "good"),
  "folder-missing": reading("Folder missing", "failed"),
  "not-a-git-repo": reading("Not a Git repository", "attention", "⚠"),
};

export const REPOS_NOT_READ = {
  level: "error",
  label: "Registered repositories not read",
  message: `Select ${REREAD_LABEL} to read the registered repositories again.`,
} as const;

// One line under the field, so each sentence names its own subject.
const registerSentences: Record<RegisterError, string> = {
  missing: "Enter the repository's absolute path.",
  relative:
    "Enter the repository's absolute path, for example /Users/name/code/my-repo.",
  "not-found": "Not a valid path. Pick another folder.",
  "not-a-directory": "Not a valid path. Pick another folder.",
  "central-inventory":
    "This is the Harness, not a valid target. Register a repository.",
  "not-a-git-repo": "Not a Git repository. Register a valid repository.",
  "already-registered": "Already registered.",
};

// A failure the table does not cover: a dropped connection, a 500, or a code
// this build predates.
const NOT_ANSWERED =
  "Maestro could not register this repository. Try registering it again.";

/**
 * The field's refusal line. Required return, never `?? error.message`: an
 * uncovered code would otherwise render the HTTP wrapper's own "Request failed
 * with status 422." on screen (#690).
 */
export function registerMessage(error: unknown): string {
  if (!(error instanceof HttpError) || error.code === undefined) {
    return NOT_ANSWERED;
  }
  const requestShape = requestShapeNotice(error);
  if (requestShape) {
    return requestShape.message;
  }
  return registerSentences[error.code as RegisterError] ?? NOT_ANSWERED;
}

const unregisterHeadings: NoticeTable<"not-registered"> = {
  "not-registered": {
    level: "error",
    label: "Repository not unregistered",
    message: `It is no longer on the list. Select ${REREAD_LABEL} to read the list again.`,
  },
};

export function unregisterNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(unregisterHeadings, error, {
    label: "Repository not unregistered",
    message: `The list did not change. Select ${UNREGISTER} to try again.`,
  });
}

// ADR-0015 point 5: the promise sits at the registration action.
export const WRITE_PROMISE =
  "Registering changes no files. Files change only when you deploy.";
export const CANCEL = "Cancel";

export const unregisterTitle = (name: string) => `${UNREGISTER} ${name}`;
export const UNREGISTER_REPOSITORY = "Unregister repository";
export const UNREGISTER_WHAT_STOPS =
  "Maestro stops tracking this folder and no longer shows it on Deploy-state.";
export const UNREGISTER_WHAT_STAYS =
  "The folder stays on disk, and everything deployed in it stays where it is.";
