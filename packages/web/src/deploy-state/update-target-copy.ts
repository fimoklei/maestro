// Every word the Update target control and its preview show (ADR-0025,
// copy.md). Pure strings, asserted one by one in the sibling test.
import type { CopyConsentRow } from "@maestro/core";
import { joinNames } from "./join-names";
import { toolDisplayName } from "./tool-labels";

// The control on the card and the dialog's confirm share one verb and object,
// so the reader sees the same act named twice (copy.md § Dialog).
export const UPDATE_TARGET = "Update target";

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

// Which release the target leaves and which one it adopts. Only the latest is
// ever offered (ADR-0031 § Accepted limits).
export const releaseMoveLine = (from: string, to: string): string =>
  `This target moves from release ${from} to release ${to}.`;

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

// Maestro's own reading from content hashes, never apm's (ADR-0031 § Accepted
// limits). Two words, no verb: a status chip (copy.md § Forms).
export const NO_CONTENT_CHANGES = "No content changes";

// The exact Selection the confirm would leave behind.
export const selectionAfterLine = (desired: readonly string[]): string =>
  `Selection after this update: ${joinNames(desired)}.`;

// The same reading when nothing is left. "Empty" is the word the card and the
// sidebar already use for a target holding nothing.
export const BECOMES_EMPTY =
  "This release removes every selected skill. The target will become Empty.";

// The two consents, named by the effect each one allows (spec story 37).
export const DISCARD_LOCAL_EDITS = "Discard local edits";
export const OVERWRITE_UNVERIFIED = "Overwrite unverified copy";

export const localEditsSentence = (name: string, release: string): string =>
  `Your copy of ${name} differs from release ${release}.`;

export const UNVERIFIED_SENTENCE =
  "This copy could not be verified. Confirm to overwrite it.";

// One copy at the grain consent is given at: the skill, and the tool where the
// target splits by tool.
export const consentRowName = (row: CopyConsentRow): string =>
  row.tool === null ? row.name : `${row.name} in ${toolDisplayName(row.tool)}`;

export const LOADING_PREVIEW = "Loading the update preview…";
