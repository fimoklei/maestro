// Every word a target card's Release head shows (ADR-0025, copy.md). Pure and
// clock-injected, so the read time is testable.
import { ago } from "../harness/harness-view-model";
import {
  UPDATE_INCOMPLETE,
  UPDATE_INCOMPLETE_SENTENCE,
} from "./update-target-copy";
import type {
  DeployedPrimitive,
  PinnedPerSkill,
  ReleaseHead,
} from "./use-deploy-state";

// The mono data step in the card header, before the status chip.
export const releaseLabel = (head: ReleaseHead): string =>
  `Release ${head.release}`;

// The meta block's first line. Null for a target on the latest release, whose
// card carries the read time alone.
export function releaseSentence(head: ReleaseHead): string | null {
  if (head.latestRelease === null) {
    return head.changed === null ? "Changes could not be read." : null;
  }
  if (head.latestRelease === head.release) {
    return null;
  }
  return head.changed === null
    ? `Newer release ${head.latestRelease}. Changes could not be read.`
    : `Newer release ${head.latestRelease}: ${head.changed} of ${head.selected} skills changed`;
}

// The meta block's second line: the fact, then when it was read (copy.md).
export function comparedLine(head: ReleaseHead, now: Date): string {
  const since = head.comparedAt === null ? null : ago(head.comparedAt, now);
  return `Compared with the Harness, ${since === null ? "not read yet" : `read ${since}`}`;
}

// The meta line under a *Pinned per skill* chip: the release most of the target
// sits on, then every tag that disagrees with it. Never a *Mixed releases*
// sentence — nothing here is half-landed (ADR-0031).
export function pinnedTagsLine(pinned: PinnedPerSkill): string {
  return pinned
    .map((group, index) => {
      const skills =
        index === 0 ? ` skill${group.skills === 1 ? "" : "s"}` : "";
      return `${group.skills}${skills} at ${group.release}`;
    })
    .join(", ");
}

// The meta block's second line under a *Pinned per skill* chip: the way to one
// release, through the two controls that already live on the rows and in the
// Inventory (#933, #962).
export const RELEASE_NOT_ADOPTED =
  "Release not adopted. Select Remove skill for each, then Deploy skill.";

// The control each unfinished operation offers, named for the operation that
// stopped (copy.md). Shared with the sentences below, so label and step agree.
export const RETRY_DEPLOY = "Retry deploy";
export const RETRY_REMOVAL = "Retry removal";

// The three notices an unfinished operation carries. Warning, not error: the
// files are in a state one control converges, and the action names the
// operation that stopped (copy.md, #951, #954).
export function unfinishedOperationNotice(
  pending: {
    kind: "deploy" | "remove" | "update";
    release: string;
    desired?: readonly string[];
  },
  // What the target holds now, so the update's detail can measure what landed
  // rather than restate the intent (spec story 8).
  primitives: readonly DeployedPrimitive[] = [],
): { level: "warning"; label: string; message: string; detail?: string } {
  if (pending.kind === "update") {
    const desired = pending.desired ?? [];
    const landed = desired.filter((name) =>
      primitives.some(
        (primitive) =>
          primitive.name === name && primitive.version === pending.release,
      ),
    ).length;
    return {
      level: "warning",
      label: UPDATE_INCOMPLETE,
      message: UPDATE_INCOMPLETE_SENTENCE,
      ...(desired.length === 0
        ? {}
        : {
            detail: `Update to ${pending.release} incomplete: ${landed} of ${desired.length} skills now use this release.`,
          }),
    };
  }
  return pending.kind === "deploy"
    ? {
        level: "warning",
        label: "Deploy incomplete",
        message: `Part of the selection is not on disk. Select ${RETRY_DEPLOY} to install release ${pending.release} again.`,
      }
    : {
        level: "warning",
        label: "Removal incomplete",
        message: `The skill's files are still on disk. Select ${RETRY_REMOVAL} to run the same removal again.`,
      };
}

// A fact to know, not an action to take: the Harness is skills-only, and a
// deploy carries whatever else the release holds (ADR-0031 § Accepted limits).
export const extraFilesLine = (count: number): string =>
  `Extra files deployed: ${count} file${count === 1 ? "" : "s"} outside the selected skills.`;

const COPY_CHIPS = {
  "local-edits": {
    label: "Local edits",
    hint: "This copy differs from the release it was deployed from",
  },
  unverified: {
    label: "Unverified",
    hint: "This copy could not be verified against a recorded baseline",
  },
} satisfies Record<
  NonNullable<DeployedPrimitive["copy"]>,
  { label: string; hint: string }
>;

export const copyChipText = (copy: NonNullable<DeployedPrimitive["copy"]>) =>
  COPY_CHIPS[copy];
