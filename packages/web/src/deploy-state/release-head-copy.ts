// Every word a target's Release, Status hover card and pane state. Clock-injected.
import { ago } from "../harness/harness-view-model";
import {
  RETRY_UPDATE,
  UPDATE_INCOMPLETE,
  UPDATE_INCOMPLETE_SENTENCE,
  UPDATE_TARGET,
} from "./update-target-copy";
import type {
  DeployedPrimitive,
  PendingOperation,
  PinnedPerSkill,
  ReleaseHead,
} from "./use-deploy-state";

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

export const ON_LATEST_RELEASE = "On the latest release.";
export const LATEST_RELEASE_UNKNOWN = "Latest release could not be read.";
export const updateNextStep = (release: string): string =>
  `Select ${UPDATE_TARGET} to use release ${release}.`;

export function comparedLine(head: ReleaseHead, now: Date): string {
  const since = head.comparedAt === null ? null : ago(head.comparedAt, now);
  return `Compared with the Harness, ${since === null ? "not read yet" : `read ${since}`}`;
}

export function pinnedTagsLine(pinned: PinnedPerSkill): string {
  return pinned
    .map((group, index) => {
      const skills =
        index === 0 ? ` skill${group.skills === 1 ? "" : "s"}` : "";
      return `${group.skills}${skills} at ${group.release}`;
    })
    .join(", ");
}

export const RELEASE_NOT_ADOPTED =
  "Release not adopted. Select Remove skill for each, then Deploy skill.";

export const RETRY_DEPLOY = "Retry deploy";
export const RETRY_REMOVAL = "Retry removal";
export const RETRY_LABELS: Record<PendingOperation["kind"], string> = {
  deploy: RETRY_DEPLOY,
  remove: RETRY_REMOVAL,
  update: RETRY_UPDATE,
};

// Warning, not error: one control converges the files.
export function unfinishedOperationNotice(
  pending: {
    kind: "deploy" | "remove" | "update";
    release: string;
    desired?: readonly string[];
  },
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

export const extraFilesFact = (count: number): string =>
  `${count} file${count === 1 ? "" : "s"}`;

export function changedFact(head: ReleaseHead): string | null {
  if (head.changed === null) return "Could not be read";
  if (head.latestRelease === null || head.latestRelease === head.release) {
    return null;
  }
  return `${head.changed} of ${head.selected} skills`;
}

export function comparedFact(head: ReleaseHead, now: Date): string {
  const since = head.comparedAt === null ? null : ago(head.comparedAt, now);
  return since === null ? "Not read yet" : `Read ${since}`;
}

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
