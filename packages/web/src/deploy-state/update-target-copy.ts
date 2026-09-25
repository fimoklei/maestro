// Every word the Update target control and its preview show.
import type { CopyConsentRow, UpdateSkillState } from "@maestro/core";
import { joinNames } from "./join-names";
import { toolDisplayName } from "./tool-labels";

export const UPDATE_TARGET = "Update target";

// An origin-less Harness cannot attribute the target's release, so no update
// can be priced (#960).
export const UPDATE_TARGET_NO_ORIGIN = `${UPDATE_TARGET} — no GitHub origin`;

export const updateDialogTitle = (target: string): string => `Update ${target}`;

export function countingSentence(counts: {
  changed: number;
  removed: number;
  unchanged: number;
}): string {
  const skills = counts.changed === 1 ? "skill" : "skills";
  return `Updates ${counts.changed} ${skills}, removes ${counts.removed}, leaves ${counts.unchanged} unchanged.`;
}

export const releaseMoveLine = (from: string, to: string): string =>
  `release ${from} → ${to}`;

// The fixed order the dialog renders; Unchanged and New in this release are folded.
export const SECTION_HEADINGS = [
  "Added by this deploy",
  "Changed",
  "Removed by this release",
  "Local edits",
  "Unchanged",
  "New in this release",
] as const;

export const [
  ADDED_BY_THIS_DEPLOY,
  CHANGED,
  REMOVED_BY_THIS_RELEASE,
  LOCAL_EDITS,
  UNCHANGED,
  NEW_IN_THIS_RELEASE,
] = SECTION_HEADINGS;

export const foldedHeading = (heading: string, count: number): string =>
  `${heading} (${count})`;

export const NOT_ADDED = "not added";

// Maestro's own reading from content hashes, never apm's.
export const NO_CONTENT_CHANGES = "No content changes";

export const selectionAfterLine = (desired: readonly string[]): string =>
  `Selected skills after this update: ${joinNames(desired)}.`;

export const BECOMES_EMPTY =
  "This release removes every selected skill. The target will become Empty.";

export const DISCARD_LOCAL_EDITS = "Discard local edits";
export const OVERWRITE_UNVERIFIED = "Overwrite unverified copy";

// Import skill… lives on the Harness screen, which this dialog cannot host.
export const KEEP_WORK_BY_IMPORTING =
  "To keep the edits instead, select Cancel, then Import skill… on the Harness screen.";

export const localEditsSentence = (name: string, release: string): string =>
  `${name} has local edits. This update replaces them with release ${release}.`;

export const unverifiedSentence = (name: string): string =>
  `${name} could not be verified. This update overwrites it.`;

export const consentRowName = (row: CopyConsentRow): string =>
  row.tool === null ? row.name : `${row.name} in ${toolDisplayName(row.tool)}`;

export const LOADING_PREVIEW = "Loading the update preview…";

export const updatingLine = (release: string): string =>
  `Updating to ${release}…`;

export const MIXED_RELEASES = "Mixed releases";

// From what was read back, never from what was asked for. The tool is named
// where the copies disagree by tool.
export function outcomeLine(
  row: { name: string; tool: string | null; state: UpdateSkillState },
  releases: { from: string; to: string },
): string {
  const where = row.tool === null ? "" : ` in ${toolDisplayName(row.tool)}`;
  return `${outcomeFact(row.name, row.state, releases)}${where}`;
}

function outcomeFact(
  name: string,
  state: UpdateSkillState,
  releases: { from: string; to: string },
): string {
  if (state === "updated") {
    return `${name} updated to ${releases.to}`;
  }
  if (state === "removed") {
    return `${name} removed`;
  }
  if (state === "not-updated") {
    return `${name} still at ${releases.from}`;
  }
  if (state === "not-removed") {
    return `${name} still deployed`;
  }
  return `Maestro could not confirm whether ${name} was updated.`;
}

export const RETRY_UPDATE = "Retry update";

export const UPDATE_INCOMPLETE = "Update incomplete";

export const UPDATE_INCOMPLETE_SENTENCE =
  "The update is incomplete. Select Retry update to run the same release again.";

export const CLOSE = "Close";
