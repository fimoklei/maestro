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

// The four path-shape failures both surfaces share. Written once: a heading
// already names the subject, so each sentence starts at the recovery (#465,
// decision 9). The register run's report has no heading and keeps its own
// standalone wording.
const repoPathHeadings: NoticeTable<
  "missing" | "relative" | "not-found" | "not-a-directory"
> = {
  missing: {
    level: "error",
    label: "no path given",
    message:
      "Type the path to a local Harness clone, or paste a GitHub repository URL.",
  },
  relative: {
    level: "error",
    label: "path is not absolute",
    message:
      "Start it from the root, so it names the same folder wherever Maestro runs.",
  },
  "not-found": {
    level: "error",
    label: "no folder at that path",
    message: "Nothing is there now. Check the spelling, or browse to it.",
  },
  "not-a-directory": {
    level: "error",
    label: "not a folder",
    message: "That path points at a file. Choose the folder that holds it.",
  },
};

const connectHeadings: NoticeTable<ConnectInventoryError> = {
  ...repoPathHeadings,
  "not-a-github-url": {
    level: "error",
    label: "not a GitHub URL",
    message:
      "Maestro clones a Harness from a GitHub repository over https or ssh, or connects a local clone by its path. Paste one of those.",
  },
  "url-carries-credentials": {
    level: "error",
    label: "URL carries credentials",
    message:
      "Maestro never stores credentials, and git would write them into the clone. Paste the plain repository URL; the local git credentials do the rest.",
  },
  "invalid-parent": {
    level: "error",
    label: "not a usable clone folder",
    message:
      "Choose an existing folder inside the home area. The Harness lands in it under its own name.",
  },
  "destination-occupied": {
    level: "error",
    label: "destination folder is taken",
    message:
      "Maestro never renames or deletes what it finds. Choose another folder to clone into.",
  },
  "destination-partial-clone": {
    level: "error",
    label: "half-finished clone in the way",
    message:
      "An interrupted attempt left it behind, and Maestro will not touch it. Delete that folder, or clone into another one.",
  },
  "clone-in-progress": {
    level: "error",
    label: "that clone is already running",
    message:
      "The first attempt is still running. Wait for it to finish before starting another.",
  },
  "clone-auth-failed": {
    level: "error",
    label: "GitHub sign-in failed",
    message:
      "Maestro uses the local git credentials and never stores any of its own. GitHub access has to be set up in git before this repository can be cloned.",
  },
  "clone-unavailable": {
    level: "error",
    label: "repository not available",
    message:
      "It may not exist, may be private, or the URL may be mistyped — GitHub answers all three the same way, so Maestro will not guess which. Check the URL, then check access to it on GitHub.",
  },
  "clone-failed": {
    level: "error",
    label: "the clone did not finish",
    message:
      "The cause is usually local: no disk space, no write access to the destination folder, or a dropped connection. Check those three, then connect again.",
  },
  "not-an-inventory": {
    level: "error",
    label: "not a Harness",
    message:
      "That folder has no apm.yml. Choose a folder that holds a Harness, or paste the GitHub URL of one.",
  },
  // An offer, not a fault: the path is fine, it just has no Harness in it yet.
  scaffoldable: {
    level: "info",
    label: "not a Harness yet",
    message:
      "Maestro can scaffold the canonical empty Harness into that repository and push the first commit to its default branch.",
  },
  "no-usable-origin": {
    level: "error",
    label: "no usable git origin",
    message:
      "The folder holds a Harness, but its git origin is missing, unreadable, or in a form apm cannot resolve. Deploys read versions from GitHub tags, so choose a clone whose origin is a GitHub repository over https or ssh.",
  },
  "no-default-branch": {
    level: "error",
    label: "no default branch",
    message:
      "Maestro cannot tell which branch that Harness's origin treats as the default, and it will not guess one. Choose a clone whose origin has a default branch set.",
  },
};

const scaffoldHeadings: NoticeTable<ScaffoldHarnessError> = {
  ...repoPathHeadings,
  "not-offered": {
    level: "error",
    label: "the offer has expired",
    message:
      "Maestro only scaffolds a repository it has just offered to scaffold. Connect that repository again to get the offer back.",
  },
  "not-a-repository": {
    level: "error",
    label: "not a git repository",
    message:
      "A Harness is scaffolded into a clone of a GitHub repository, and that folder is not one.",
  },
  "already-a-harness": {
    level: "error",
    label: "already a Harness",
    message:
      "It already holds an apm.yml, so there is nothing to scaffold. Connect it as it is.",
  },
  "path-occupied": {
    level: "error",
    label: "files already in the way",
    message:
      "The scaffold would have overwritten files already in that repository, so it wrote nothing. Clear them, or scaffold into another repository.",
  },
  "no-default-branch": {
    level: "error",
    label: "no default branch",
    message:
      "Maestro cannot tell which branch that repository's origin treats as the default, and it will not guess one. Choose a repository whose origin has a default branch set.",
  },
  "not-on-default-branch": {
    level: "error",
    label: "not on the default branch",
    message:
      "The scaffold's first commit belongs on the default branch. Switch that clone to it, then scaffold again.",
  },
  busy: {
    level: "error",
    label: "a scaffold is already running",
    message:
      "The first attempt is still running. Wait for it to finish before starting another.",
  },
  "write-failed": {
    level: "error",
    label: "nothing was written",
    message:
      "Maestro removed the files it had already written, so the repository is as it was. That folder is most likely not writable — check its permissions, then scaffold again.",
  },
  "commit-failed": {
    level: "error",
    label: "the commit failed",
    message:
      "The Harness files are in the clone, but git would not commit them. That happens when the repository has no author identity configured.",
  },
  "push-rejected": {
    level: "error",
    label: "GitHub refused the push",
    message:
      "The commit is safe in the clone. What is missing is push access to that repository's default branch.",
  },
  "push-offline": {
    level: "error",
    label: "GitHub could not be reached",
    message:
      "The commit is safe in the clone. It reaches GitHub as soon as the connection is back.",
  },
  "connect-failed": {
    level: "error",
    label: "scaffolded but not connected",
    message:
      "The Harness is in the repository and pushed, but Maestro could not connect it. Connect it by its local path.",
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
      message:
        "The Maestro server did not answer, so nothing was connected. Connect it again.",
    },
    extras,
  );
}

export function scaffoldNotice(error: unknown): NoticeContent | null {
  return noticeFromTable(scaffoldHeadings, error, {
    label: "Nothing scaffolded",
    message:
      "The Maestro server did not answer, and no files were written. Scaffold it again.",
  });
}
