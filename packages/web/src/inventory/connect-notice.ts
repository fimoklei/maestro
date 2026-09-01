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

// The four path-shape failures both surfaces share, written once: a heading
// already names the subject, so each sentence starts at the recovery (#465,
// decision 9).
const repoPathHeadings: NoticeTable<
  "missing" | "relative" | "not-found" | "not-a-directory"
> = {
  missing: {
    level: "error",
    label: "No path given",
    message:
      "Type the path to a local Harness clone, or paste a GitHub repository URL.",
  },
  relative: {
    level: "error",
    label: "Path not absolute",
    message:
      "Start the path from the root, so it names one folder wherever Maestro runs.",
  },
  "not-found": {
    level: "error",
    label: "No folder at that path",
    message: "Check the spelling, or select browse… to pick the folder.",
    detail: "Nothing is at that path now.",
  },
  "not-a-directory": {
    level: "error",
    label: "Not a folder",
    message: "Choose the folder that holds it.",
    detail: "That path points at a file.",
  },
};

const connectHeadings: NoticeTable<ConnectInventoryError> = {
  ...repoPathHeadings,
  "not-a-github-url": {
    level: "error",
    label: "Not a GitHub URL",
    message:
      "Paste a GitHub repository URL, or type the path to a local Harness clone.",
    detail: "Maestro clones over https or ssh.",
  },
  "url-carries-credentials": {
    level: "error",
    label: "Credentials in the URL",
    message:
      "Paste the plain repository URL. Maestro uses the local git credentials.",
    detail: "git would write the credentials from the URL into the clone.",
  },
  "invalid-parent": {
    level: "error",
    label: "Unusable clone folder",
    message: "Choose an existing folder inside your home folder.",
    detail: "The Harness lands in it under its own name.",
  },
  "destination-occupied": {
    level: "error",
    label: "Destination folder taken",
    message: "Choose another folder to clone into.",
    detail: "Maestro never renames or deletes what it finds.",
  },
  "destination-partial-clone": {
    level: "error",
    label: "Half-finished clone in the way",
    message: "Delete that folder, or choose another folder to clone into.",
    detail: "An interrupted attempt left the folder behind.",
  },
  "clone-in-progress": {
    level: "error",
    label: "Clone already running",
    message: "Wait for the first attempt to finish.",
  },
  "clone-auth-failed": {
    level: "error",
    label: "No GitHub access",
    message: "Set up GitHub access in git, then connect again.",
    detail:
      "Maestro uses the local git credentials and stores none of its own.",
  },
  "clone-unavailable": {
    level: "error",
    label: "Repository not available",
    message: "Check the URL, then check your access to it on GitHub.",
    detail:
      "GitHub answers a missing, a private and a mistyped repository the same way.",
  },
  "clone-failed": {
    level: "error",
    label: "Clone did not finish",
    message:
      "Check disk space and write access to the destination folder, then connect again.",
    detail: "A dropped connection causes this too.",
  },
  "not-an-inventory": {
    level: "error",
    label: "Not a Harness",
    message:
      "Choose a folder that holds a Harness, or paste the GitHub URL of one.",
    detail: "The folder has no apm.yml.",
  },
  // An offer, not a fault: the heading names what is on offer, and the caller
  // replaces the detail with the folder it would scaffold into.
  scaffoldable: {
    level: "info",
    label: "Harness scaffold available",
    message:
      "Scaffold the Harness, and Maestro pushes the first commit to the default branch.",
    detail: "The folder is a git repository with no Harness in it.",
  },
  "no-usable-origin": {
    level: "error",
    label: "No GitHub origin",
    message: "Point the clone's origin at GitHub, or choose another clone.",
    detail:
      "Deploys read versions from GitHub tags, so the origin must be https or ssh.",
  },
  "no-default-branch": {
    level: "error",
    label: "No default branch",
    message: "Set a default branch on the origin, or choose another clone.",
    detail: "The origin does not say which branch is the default.",
  },
};

const scaffoldHeadings: NoticeTable<ScaffoldHarnessError> = {
  ...repoPathHeadings,
  "not-offered": {
    level: "error",
    label: "Offer expired",
    message: "Connect that repository again to get the offer back.",
  },
  "not-a-repository": {
    level: "error",
    label: "Not a git repository",
    message: "Choose a clone of a GitHub repository.",
    detail: "A Harness is scaffolded into one.",
  },
  "already-a-harness": {
    level: "error",
    label: "Already a Harness",
    message: "Connect it as it is.",
    detail: "The folder already holds an apm.yml.",
  },
  "path-occupied": {
    level: "error",
    label: "Files in the way",
    message:
      "Nothing was written. Clear the files, or scaffold into another repository.",
  },
  "no-default-branch": {
    level: "error",
    label: "No default branch",
    message:
      "Set a default branch on the origin, or choose another repository.",
    detail: "The origin does not say which branch is the default.",
  },
  "not-on-default-branch": {
    level: "error",
    label: "Not on the default branch",
    message: "Switch the clone to it, then scaffold again.",
    detail: "The scaffold's first commit belongs on the default branch.",
  },
  busy: {
    level: "error",
    label: "Scaffold already running",
    message: "Wait for the first attempt to finish.",
  },
  "write-failed": {
    level: "error",
    label: "Nothing written",
    message:
      "The repository is as it was. Check the folder's permissions, then scaffold again.",
    detail: "Maestro removed the files it had already written.",
  },
  "commit-failed": {
    level: "error",
    label: "Nothing committed",
    message:
      "The Harness files are in the clone. Set a git author identity, then scaffold again.",
    detail: "The repository has no author identity configured.",
  },
  "push-rejected": {
    level: "error",
    label: "Push refused",
    message:
      "The commit is safe in the clone. Get push access to the default branch.",
    detail: "GitHub refused a push to that branch.",
  },
  "push-offline": {
    level: "error",
    label: "GitHub unreachable",
    message:
      "The commit is safe in the clone. Scaffold again once the connection is back.",
  },
  "connect-failed": {
    level: "error",
    label: "Scaffolded, not connected",
    message: "The Harness is pushed. Connect it by its local path.",
  },
};

// One fallback per surface: a failure no row covers still costs each of these
// something different, and the sentence says which (#688).
export function connectNotice(
  error: unknown,
  extras: NoticeExtras = {},
): NoticeContent | null {
  return noticeFromTable(
    connectHeadings,
    error,
    {
      label: "Harness not connected",
      message: "Nothing was connected. Connect it again.",
      detail: "The Maestro server did not answer.",
    },
    extras,
  );
}

export function scaffoldNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(scaffoldHeadings, error, {
    label: "Harness not scaffolded",
    message: "No files were written. Scaffold it again.",
    detail: "The Maestro server did not answer.",
  });
}
