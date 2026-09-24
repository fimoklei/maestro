// Every word the Update target control and its preview show (ADR-0025,
// copy.md). Pure strings, asserted one by one in the sibling test.
import type { CopyConsentRow, UpdateSkillState } from "@maestro/core";
import { joinNames } from "./join-names";
import { toolDisplayName } from "./tool-labels";

// The control on the card and the dialog's confirm share one verb and object,
// so the reader sees the same act named twice (copy.md § Dialog).
export const UPDATE_TARGET = "Update target";

// The same control with nothing behind it: an origin-less Harness cannot
// attribute the target's release, so no update can be priced (#960, copy.md
// § Blocked control).
export const UPDATE_TARGET_NO_ORIGIN = `${UPDATE_TARGET} — no GitHub origin`;

// The same control kept in a row's menu with nothing to update, by cause
// (copy.md § Blocked control, #1067). A read that failed claims no absence.
export const UPDATE_TARGET_BLOCKED = {
  notRead: `${UPDATE_TARGET} — target not read`,
  unfinished: `${UPDATE_TARGET} — unfinished operation`,
  pinned: `${UPDATE_TARGET} — pinned per skill`,
  empty: `${UPDATE_TARGET} — nothing deployed`,
  latestUnknown: `${UPDATE_TARGET} — latest release unknown`,
  onLatest: `${UPDATE_TARGET} — on the latest release`,
} as const;

// The dialog acts on a target the reader already chose, so its title names it.
export const updateDialogTitle = (target: string): string => `Update ${target}`;

// The opener: the size of the change before any list (spec story 14).
export function countingSentence(counts: {
  changed: number;
  removed: number;
  unchanged: number;
}): string {
  const skills = counts.changed === 1 ? "skill" : "skills";
  return `Updates ${counts.changed} ${skills}, removes ${counts.removed}, leaves ${counts.unchanged} unchanged.`;
}

// Which release the target leaves and which one it adopts, as a version pair
// under the title. Only the latest is ever offered (ADR-0031 § Accepted limits).
export const releaseMoveLine = (from: string, to: string): string =>
  `release ${from} → ${to}`;

// The fixed order the dialog renders. Added by this deploy is the Inventory's
// entrance (#955); Unchanged and New in this release are folded.
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

// A folded section states its count, so a selection of forty-seven skills opens
// on the work rather than on a list (spec story 19).
export const foldedHeading = (heading: string, count: number): string =>
  `${heading} (${count})`;

// Beside the folded New in this release: Update adds no skill (spec story 18).
export const NOT_ADDED = "not added";

// Maestro's own reading from content hashes, never apm's (ADR-0031 § Accepted
// limits). Two words, no verb: a status chip (copy.md § Forms).
export const NO_CONTENT_CHANGES = "No content changes";

// The exact Selection the confirm would leave behind, in its on-screen words.
export const selectionAfterLine = (desired: readonly string[]): string =>
  `Selected skills after this update: ${joinNames(desired)}.`;

// The same reading when nothing is left. "Empty" is the word the card and the
// sidebar already use for a target holding nothing.
export const BECOMES_EMPTY =
  "This release removes every selected skill. The target will become Empty.";

// The two consents, named by the effect each one allows (spec story 37).
export const DISCARD_LOCAL_EDITS = "Discard local edits";
export const OVERWRITE_UNVERIFIED = "Overwrite unverified copy";

// The second way out (spec story 36). Import skill… lives on the Harness
// screen, which this dialog cannot host, so the step names that place.
export const KEEP_WORK_BY_IMPORTING =
  "To keep the edits instead, select Cancel, then Import skill… on the Harness screen.";

export const localEditsSentence = (name: string, release: string): string =>
  `${name} has local edits. This update replaces them with release ${release}.`;

export const unverifiedSentence = (name: string): string =>
  `${name} could not be verified. This update overwrites it.`;

// One copy at the grain consent is given at: the skill, and the tool where the
// target splits by tool.
export const consentRowName = (row: CopyConsentRow): string =>
  row.tool === null ? row.name : `${row.name} in ${toolDisplayName(row.tool)}`;

export const LOADING_PREVIEW = "Loading the update preview…";

// The card while apm runs. Every control is gone from it until the answer is
// read back, so a second operation cannot be started (spec story 27).
export const updatingLine = (release: string): string =>
  `Updating to ${release}…`;

// Maestro's own reading of a half-landed update: the files disagree about which
// release they came from, and one control converges them (ADR-0031).
export const MIXED_RELEASES = "Mixed releases";

// One line per skill, from what was read back — never from what was asked for
// (spec story 28). The tool is named where the copies disagree by tool.
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

// The way out of a half-landed update, named on the card and in the dialog.
export const RETRY_UPDATE = "Retry update";

// A row's retry item with no unfinished operation, or while its own retry
// runs (copy.md § Blocked control, #1067).
export const RETRY_UPDATE_NOTHING = `${RETRY_UPDATE} — nothing to retry`;
export const RETRY_UPDATE_NOT_READ = `${RETRY_UPDATE} — target not read`;
export const retryRunning = (label: string): string =>
  `${label} — already running`;

// The dialog's own reading once the outcome is in: the same heading the card
// carries, so one state is named once (copy.md).
export const UPDATE_INCOMPLETE = "Update incomplete";

export const UPDATE_INCOMPLETE_SENTENCE =
  "The update is incomplete. Select Retry update to run the same release again.";

// After the outcome there is nothing left to cancel, so the one control left
// closes the dialog.
export const CLOSE = "Close";
