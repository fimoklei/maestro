// Every word a target card's Release head shows (ADR-0025, copy.md). Pure and
// clock-injected, so the read time is testable.
import { ago } from "../harness/harness-view-model";
import type { DeployedPrimitive, ReleaseHead } from "./use-deploy-state";

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
