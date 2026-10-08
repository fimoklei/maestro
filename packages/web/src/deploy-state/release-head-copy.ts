// Every word a target's Release, Status hover card and pane state. Clock-injected.
import type {
  DeployedPrimitive,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
} from "@maestro/core";
import { ago, NOT_READ_YET } from "../ui/freshness";
import { type Copy, machine, type Phrase, phrase } from "../ui/phrase";
import { joinNames } from "./join-names";
import {
  RETRY_UPDATE,
  UPDATE_INCOMPLETE,
  UPDATE_INCOMPLETE_REASON,
  UPDATE_INCOMPLETE_SENTENCE,
} from "./update-target-copy";

// A behind target's reason; this tool's own release can already be the latest
// when another tool on the one global target is behind (#951).
export function behindReason(head: ReleaseHead): Copy {
  if (head.latestRelease === null) return LATEST_RELEASE_UNKNOWN;
  const latest = machine(head.latestRelease);
  if (head.latestRelease === head.release) {
    return phrase`Another tool's skills are behind ${latest}.`;
  }
  if (head.changed === null) {
    return phrase`Changes in ${latest} could not be read.`;
  }
  return head.changed === 0
    ? phrase`None of the ${head.selected} deployed skills changed in ${latest}.`
    : phrase`${head.changed} of ${head.selected} deployed skills changed in ${latest}.`;
}

// The reason, then the control that moves the target (design.md → Disclosure).
export function behindLine(head: ReleaseHead, updateLabel: string): Copy {
  const reason = behindReason(head);
  return head.latestRelease === null
    ? reason
    : phrase`${reason} Select ${updateLabel} to move this target to ${machine(head.latestRelease)}.`;
}

export const ON_LATEST_RELEASE = "On the latest release.";
export const LATEST_RELEASE_UNKNOWN = "Latest release could not be read.";

export function pinnedTagsLine(pinned: PinnedPerSkill): Phrase {
  const groups = pinned.map((group, index) => {
    const skills = index === 0 ? ` skill${group.skills === 1 ? "" : "s"}` : "";
    return phrase`${group.skills}${skills} at ${machine(group.release)}`;
  });
  return phrase`${groups.reduce((line, group) => phrase`${line}, ${group}`)}.`;
}

export const RELEASE_NOT_ADOPTED =
  "Release not adopted. Select Remove skill for each, then Deploy skill.";

const RETRY_DEPLOY = "Retry deploy";
const RETRY_REMOVAL = "Retry removal";
export const RETRY_LABELS: Record<PendingOperation["kind"], string> = {
  deploy: RETRY_DEPLOY,
  remove: RETRY_REMOVAL,
  update: RETRY_UPDATE,
};

/** What an unfinished operation left, without its retry. */
export const UNFINISHED_REASONS: Record<PendingOperation["kind"], string> = {
  deploy: "Part of the selection is not on disk.",
  remove: "The skill's files are still on disk.",
  update: UPDATE_INCOMPLETE_REASON,
};

// Warning, not error: one control converges the files.
export function unfinishedOperationNotice(
  pending: {
    kind: "deploy" | "remove" | "update";
    release: string;
    desired?: readonly string[];
  },
  primitives: readonly DeployedPrimitive[] = [],
): { level: "warning"; label: string; message: Copy; detail?: Copy } {
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
            detail: phrase`Update to ${machine(pending.release)} incomplete: ${landed} of ${desired.length} skills now use this release.`,
          }),
    };
  }
  return pending.kind === "deploy"
    ? {
        level: "warning",
        label: "Deploy incomplete",
        message: phrase`${UNFINISHED_REASONS.deploy} Select ${RETRY_DEPLOY} to deploy release ${machine(pending.release)} again.`,
      }
    : {
        level: "warning",
        label: "Removal incomplete",
        message: `${UNFINISHED_REASONS.remove} Select ${RETRY_REMOVAL} to run the same removal again.`,
      };
}

export const extraFilesFact = (count: number): string =>
  `${count} file${count === 1 ? "" : "s"}`;

export function changedFact(head: ReleaseHead): string | null {
  if (head.changed === null) return "Could not be read";
  if (head.latestRelease === null || head.latestRelease === head.release) {
    return null;
  }
  const count = `${head.changed} of ${head.selected} skills`;
  return head.changedSkills?.length
    ? `${count}: ${joinNames(head.changedSkills)}`
    : count;
}

export const latestReleaseFact = (head: ReleaseHead | undefined) =>
  head?.latestRelease && head.latestRelease !== head.release
    ? head.latestRelease
    : null;

export function comparedFact(head: ReleaseHead, now: Date): string {
  const since = head.comparedAt === null ? null : ago(head.comparedAt, now);
  return since === null ? NOT_READ_YET : `Read ${since}`;
}

const COPY_CHIPS = {
  "local-edits": {
    label: "Local edits",
    hint: "Files changed after deployment.",
  },
  unverified: {
    label: "Unverified",
    hint: "The deployment record cannot check this copy.",
  },
} satisfies Record<
  NonNullable<DeployedPrimitive["copy"]>,
  { label: string; hint: string }
>;

export const copyChipText = (copy: NonNullable<DeployedPrimitive["copy"]>) =>
  COPY_CHIPS[copy];
