// Every word the Update target control and its preview show.
import type { CopyConsentRow, UpdateSkillState } from "@maestro/core";
import { UPDATE_TARGET, UPDATE_TARGETS } from "../ui/control-labels";
import { type Copy, machine, named, type Phrase, phrase } from "../ui/phrase";
import { toolDisplayName } from "./tool-presentation";

// An origin-less Harness cannot attribute the target's release, so no update
// can be priced (#960).
export const NO_GITHUB_ORIGIN = "no GitHub origin";

export const CONSENT_NOT_GIVEN = "consent not given";

export const updateDialogTitle = (target: string): string => `Update ${target}`;

export function countingSentence(counts: {
  changed: number;
  removed: number;
  unchanged: number;
}): string {
  const skills = counts.changed === 1 ? "skill" : "skills";
  return `Updates ${counts.changed} ${skills}, removes ${counts.removed}, leaves ${counts.unchanged} unchanged.`;
}

export const releaseMoveLine = (from: string, to: string): Phrase =>
  phrase`release ${machine(from)} → ${machine(to)}`;

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

export const BECOMES_EMPTY =
  "This release removes every selected skill. The target will become Empty.";

export const DISCARD_LOCAL_EDITS = "Discard local edits";
export const OVERWRITE_UNVERIFIED = "Overwrite unverified copy";

export const KEEP_WORK_BY_IMPORTING =
  "To keep the edits instead, select Cancel, then Import local edits.";

export const localEditsSentence = (name: string, release: string): Phrase =>
  phrase`${named(name)} has local edits. This update replaces them with release ${machine(release)}.`;

export const unverifiedSentence = (name: string): Phrase =>
  phrase`${named(name)} could not be verified. This update overwrites it.`;

export const consentRowName = (row: CopyConsentRow): string =>
  row.tool === null ? row.name : `${row.name} in ${toolDisplayName(row.tool)}`;

export const LOADING_PREVIEW = "Loading the update preview…";

export const MIXED_RELEASES = "Mixed releases";

type OutcomeVerdict = "landed" | "failed" | "unconfirmed";

export function outcomeHeading(to: string, verdict: OutcomeVerdict): string {
  if (verdict === "landed") {
    return `Updated to ${to}`;
  }
  return verdict === "failed"
    ? `Not every skill reached ${to}`
    : `Maestro could not confirm every skill reached ${to}`;
}

export const RETRY_UPDATE = "Retry update";

const RETRY_UPDATE_STEP = `Select ${RETRY_UPDATE} to run the same release again.`;

// An update that moves more than its row says so in its label (copy.md).
export const updateLabel = (row: { name: string; updateName: string }) =>
  row.updateName === row.name ? UPDATE_TARGET : UPDATE_TARGETS;

export const updateAgain = (label: string) => `then select ${label} again.`;
export const UPDATE_AGAIN = updateAgain(UPDATE_TARGET);

export type UnlandedState = Exclude<UpdateSkillState, "updated" | "removed">;

// From what was read back, never from apm's own words. A landed row needs no
// sentence beyond the release it reached.
export function outcomeDetail(
  state: UnlandedState,
  releases: { from: string; to: string },
  retry: boolean,
): Copy {
  if (state === "unknown") {
    return "Maestro could not read this skill back. Check its state on the Deploy-state screen.";
  }
  const fact = {
    "not-updated": phrase`Still at ${machine(releases.from)}.`,
    missing: "Not deployed.",
    "not-removed": phrase`Still deployed, though ${machine(releases.to)} drops it.`,
  }[state];
  return phrase`${fact} ${retry ? RETRY_UPDATE_STEP : `Check the target on the Deploy-state screen, ${UPDATE_AGAIN}`}`;
}

export const UPDATE_INCOMPLETE = "Update incomplete";

export const UPDATE_INCOMPLETE_REASON = "The update is incomplete.";
export const UPDATE_INCOMPLETE_SENTENCE = `${UPDATE_INCOMPLETE_REASON} ${RETRY_UPDATE_STEP}`;
