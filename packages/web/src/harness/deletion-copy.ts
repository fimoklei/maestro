import type { HarnessPrimitiveType } from "@maestro/core";
import { NEXT_RELEASE } from "../ui/band-copy";
import {
  DELETE_LABEL,
  PROPOSE_CHANGE,
  UPDATE_TARGET,
} from "../ui/control-labels";
import type { NoticeContent } from "../ui/notice";
import { named, type Phrase, phrase } from "../ui/phrase";
import type { LocalDeletionContext } from "./local-deletion-copy";

// The Delete dialog's words for one type. A prompt is one file and deploys to
// no target, so its sentences name a file and no targets.
type DeletionWording = {
  label: string;
  inClone: (name: string, origin: string) => Phrase;
  localOnly: (name: string) => Phrase;
  proposes: (origin: string) => Phrase;
  // What still holds the item while the deletion waits for review.
  keeps: (name: string) => Phrase;
  uncommittedDetail: (origin: string) => Phrase;
};

export const DELETION_COPY: Record<HarnessPrimitiveType, DeletionWording> = {
  skill: {
    label: DELETE_LABEL.skill,
    inClone: (name, origin) =>
      phrase`${DELETE_LABEL.skill} removes the ${named(name)} folder from your clone of ${named(origin)}. The skill stays in ${named(origin)} and in your targets.`,
    localOnly: (name) =>
      phrase`${DELETE_LABEL.skill} removes the folder from disk. No other copy of ${named(name)} exists.`,
    proposes: (origin) =>
      phrase`${DELETE_LABEL.skill} proposes this deletion to ${named(origin)} for review.`,
    keeps: () =>
      phrase`Your targets keep the skill. After the next release, select ${UPDATE_TARGET} on each target to remove it.`,
    uncommittedDetail: (origin) =>
      phrase`The skill's files in your clone of ${named(origin)} differ from its last commit.`,
  },
  prompt: {
    label: DELETE_LABEL.prompt,
    inClone: (name, origin) =>
      phrase`${DELETE_LABEL.prompt} removes the ${named(name)} file from your clone of ${named(origin)}. The prompt stays in ${named(origin)}.`,
    localOnly: (name) =>
      phrase`${DELETE_LABEL.prompt} removes the file from disk. No other copy of ${named(name)} exists.`,
    proposes: (origin) =>
      phrase`${DELETE_LABEL.prompt} proposes this deletion to ${named(origin)} for review.`,
    keeps: (name) =>
      phrase`The Prompts screen keeps ${named(name)} until the next release.`,
    uncommittedDetail: (origin) =>
      phrase`The prompt file in your clone of ${named(origin)} differs from its last commit.`,
  },
};

export const deletionTitle = (name: string) => `Delete ${name}`;

export const NEXT_RELEASE_COMMIT_FACT = "Next release commit";

// Says what the confirmation-stale notice does (#885).
export const NEXT_RELEASE_COMMIT_HINT = `If ${NEXT_RELEASE} changes before you confirm, nothing is pushed.`;

// Where the dialog opened: only the Harness screen has Propose change.
export const deleteFromOrigin = (
  origin: string,
  screen: LocalDeletionContext["screen"],
): Phrase =>
  screen === "harness"
    ? phrase`To also delete it from ${named(origin)}, select ${PROPOSE_CHANGE}.`
    : phrase`To also delete it from ${named(origin)}, go to the Harness screen and select ${PROPOSE_CHANGE}.`;

export const uncommittedNotice = (
  type: HarnessPrimitiveType,
  name: string,
  origin: string,
): NoticeContent => ({
  level: "warning",
  label: `Uncommitted changes in ${name}`,
  message: `${DELETION_COPY[type].label} discards them. To keep them, commit them in your Git tool first.`,
  detail: DELETION_COPY[type].uncommittedDetail(origin),
});

// Several Contributors share one proposal branch, so the request may be a
// teammate's, or an app's.
export const openRequestNotice = (
  type: HarnessPrimitiveType,
  name: string,
  request: { number: number; author: string } | null,
): NoticeContent | null =>
  request === null
    ? null
    : {
        level: "warning",
        label: `Pull request #${request.number} will delete ${name} instead`,
        message: phrase`${named(request.author)} opened it to propose changes to ${named(name)}. ${DELETION_COPY[type].label} replaces those changes with the deletion.`,
      };
