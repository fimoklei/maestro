import { describe, expect, it } from "vitest";
import { HttpError } from "../api/http";
import { connectNotice, scaffoldNotice } from "./connect-notice";

// The finished notice, asserted as data (ADR-0025 §10 rejected a copy linter):
// level, heading, sentence, detail and action label together are the reviewer's
// unit, so the test's unit is the whole object.
function connectFor(code: string) {
  return connectNotice(new HttpError(400, "", code));
}

function scaffoldFor(code: string) {
  return scaffoldNotice(new HttpError(400, "", code));
}

describe("connectNotice", () => {
  it("returns null without an error", () => {
    expect(connectNotice(null)).toBeNull();
  });

  it("states the four path-shape refusals", () => {
    expect(connectFor("missing")).toEqual({
      level: "error",
      label: "No path given",
      message:
        "Type the path to a local Harness clone, or paste a GitHub repository URL.",
    });
    expect(connectFor("relative")).toEqual({
      level: "error",
      label: "Path not absolute",
      message:
        "Start the path from the root, so it names one folder wherever Maestro runs.",
    });
    expect(connectFor("not-found")).toEqual({
      level: "error",
      label: "No folder at that path",
      message: "Check the spelling, or select browse… to pick the folder.",
      detail: "Nothing is at that path now.",
    });
    expect(connectFor("not-a-directory")).toEqual({
      level: "error",
      label: "Not a folder",
      message: "Choose the folder that holds it.",
      detail: "That path points at a file.",
    });
  });

  it("states every connect refusal", () => {
    expect(connectFor("not-a-github-url")).toEqual({
      level: "error",
      label: "Not a GitHub URL",
      message:
        "Paste a GitHub repository URL, or type the path to a local Harness clone.",
      detail: "Maestro clones over https or ssh.",
    });
    expect(connectFor("url-carries-credentials")).toEqual({
      level: "error",
      label: "Credentials in the URL",
      message:
        "Paste the plain repository URL. Maestro uses the local git credentials.",
      detail: "git would write the credentials from the URL into the clone.",
    });
    expect(connectFor("invalid-parent")).toEqual({
      level: "error",
      label: "Unusable clone folder",
      message: "Choose an existing folder inside your home folder.",
      detail: "The Harness lands in it under its own name.",
    });
    expect(connectFor("destination-occupied")).toEqual({
      level: "error",
      label: "Destination folder taken",
      message: "Choose another folder to clone into.",
      detail: "Maestro never renames or deletes what it finds.",
    });
    expect(connectFor("destination-partial-clone")).toEqual({
      level: "error",
      label: "Half-finished clone in the way",
      message: "Delete that folder, or choose another folder to clone into.",
      detail: "An interrupted attempt left the folder behind.",
    });
    expect(connectFor("clone-in-progress")).toEqual({
      level: "error",
      label: "Clone already running",
      message: "Wait for the first attempt to finish.",
    });
    expect(connectFor("clone-auth-failed")).toEqual({
      level: "error",
      label: "No GitHub access",
      message: "Set up GitHub access in git, then connect again.",
      detail:
        "Maestro uses the local git credentials and stores none of its own.",
    });
    expect(connectFor("clone-unavailable")).toEqual({
      level: "error",
      label: "Repository not available",
      message: "Check the URL, then check your access to it on GitHub.",
      detail:
        "GitHub answers a missing, a private and a mistyped repository the same way.",
    });
    expect(connectFor("clone-failed")).toEqual({
      level: "error",
      label: "Clone did not finish",
      message:
        "Check disk space and write access to the destination folder, then connect again.",
      detail: "A dropped connection causes this too.",
    });
    expect(connectFor("not-an-inventory")).toEqual({
      level: "error",
      label: "Not a Harness",
      message:
        "Choose a folder that holds a Harness, or paste the GitHub URL of one.",
      detail: "The folder has no apm.yml.",
    });
    expect(connectFor("no-usable-origin")).toEqual({
      level: "error",
      label: "No GitHub origin",
      message: "Point the clone's origin at GitHub, or choose another clone.",
      detail:
        "Deploys read versions from GitHub tags, so the origin must be https or ssh.",
    });
    expect(connectFor("no-default-branch")).toEqual({
      level: "error",
      label: "No default branch",
      message: "Set a default branch on the origin, or choose another clone.",
      detail: "The origin does not say which branch is the default.",
    });
  });

  it("states the scaffold offer as an offer, not a fault", () => {
    expect(connectFor("scaffoldable")).toEqual({
      level: "info",
      label: "Harness scaffold available",
      message:
        "Scaffold the Harness, and Maestro pushes the first commit to the default branch.",
      detail: "The folder is a git repository with no Harness in it.",
    });
  });

  it("keeps the call site's detail and action on the row", () => {
    expect(
      connectNotice(new HttpError(409, "", "scaffoldable"), {
        detail: "Maestro would scaffold it into /repos/harness.",
        action: { label: "Scaffold the Harness", onClick: () => {} },
      }),
    ).toEqual({
      level: "info",
      label: "Harness scaffold available",
      message:
        "Scaffold the Harness, and Maestro pushes the first commit to the default branch.",
      detail: "Maestro would scaffold it into /repos/harness.",
      action: { label: "Scaffold the Harness", onClick: expect.any(Function) },
    });
  });

  it("states its own cost for a code no row covers", () => {
    expect(connectNotice(new Error("boom"))).toEqual({
      level: "error",
      label: "Harness not connected",
      message: "Nothing was connected. Connect it again.",
      detail: "The Maestro server did not answer.",
    });
  });
});

describe("scaffoldNotice", () => {
  it("returns null without an error", () => {
    expect(scaffoldNotice(null)).toBeNull();
  });

  it("states every scaffold refusal", () => {
    expect(scaffoldFor("missing")).toEqual({
      level: "error",
      label: "No path given",
      message:
        "Type the path to a local Harness clone, or paste a GitHub repository URL.",
    });
    expect(scaffoldFor("not-offered")).toEqual({
      level: "error",
      label: "Offer expired",
      message: "Connect that repository again to get the offer back.",
    });
    expect(scaffoldFor("not-a-repository")).toEqual({
      level: "error",
      label: "Not a git repository",
      message: "Choose a clone of a GitHub repository.",
      detail: "A Harness is scaffolded into one.",
    });
    expect(scaffoldFor("already-a-harness")).toEqual({
      level: "error",
      label: "Already a Harness",
      message: "Connect it as it is.",
      detail: "The folder already holds an apm.yml.",
    });
    expect(scaffoldFor("path-occupied")).toEqual({
      level: "error",
      label: "Files in the way",
      message:
        "Nothing was written. Clear the files, or scaffold into another repository.",
    });
    expect(scaffoldFor("no-default-branch")).toEqual({
      level: "error",
      label: "No default branch",
      message:
        "Set a default branch on the origin, or choose another repository.",
      detail: "The origin does not say which branch is the default.",
    });
    expect(scaffoldFor("not-on-default-branch")).toEqual({
      level: "error",
      label: "Not on the default branch",
      message: "Switch the clone to it, then scaffold again.",
      detail: "The scaffold's first commit belongs on the default branch.",
    });
    expect(scaffoldFor("busy")).toEqual({
      level: "error",
      label: "Scaffold already running",
      message: "Wait for the first attempt to finish.",
    });
    expect(scaffoldFor("write-failed")).toEqual({
      level: "error",
      label: "Nothing written",
      message:
        "The repository is as it was. Check the folder's permissions, then scaffold again.",
      detail: "Maestro removed the files it had already written.",
    });
    expect(scaffoldFor("commit-failed")).toEqual({
      level: "error",
      label: "Nothing committed",
      message:
        "The Harness files are in the clone. Set a git author identity, then scaffold again.",
      detail: "The repository has no author identity configured.",
    });
    expect(scaffoldFor("push-rejected")).toEqual({
      level: "error",
      label: "Push refused",
      message:
        "The commit is safe in the clone. Get push access to the default branch.",
      detail: "GitHub refused a push to that branch.",
    });
    expect(scaffoldFor("push-offline")).toEqual({
      level: "error",
      label: "GitHub unreachable",
      message:
        "The commit is safe in the clone. Scaffold again once the connection is back.",
    });
    expect(scaffoldFor("connect-failed")).toEqual({
      level: "error",
      label: "Scaffolded, not connected",
      message: "The Harness is pushed. Connect it by its local path.",
    });
  });

  it("states its own cost for a code no row covers", () => {
    expect(scaffoldNotice(new Error("boom"))).toEqual({
      level: "error",
      label: "Harness not scaffolded",
      message: "No files were written. Scaffold it again.",
      detail: "The Maestro server did not answer.",
    });
  });
});
