import { parseGitOrigin } from "../deploy/git-origin";
import type { LatestRelease } from "./latest-release";
import type {
  HarnessFacts,
  HarnessGitPort,
  HarnessTag,
} from "./read-harness-state";
import { type ReleaseDelta, readReleaseDelta } from "./release-delta";

export type ReleaseBlock = "empty-delta" | "root-skill-file";

type ReleaseReadiness = {
  released: HarnessTag | null;
  tags: HarnessTag[];
  head: string;
  defaultBranch: string;
  content: { delta: ReleaseDelta; blocked: ReleaseBlock | null } | null;
};

type ReleaseReadinessResult =
  | { ok: true; readiness: ReleaseReadiness }
  | { ok: false; error: "no-usable-origin" | "no-answer" };

export const readReleaseReadiness = async (
  git: Pick<
    HarnessGitPort,
    "readPrimitives" | "readListHash" | "readAuthors" | "readRootFiles"
  >,
  root: string,
  facts: HarnessFacts,
  latest: LatestRelease,
): Promise<ReleaseReadinessResult> => {
  const origin =
    facts.originUrl === null ? null : parseGitOrigin(facts.originUrl);
  if (origin === null) {
    return { ok: false, error: "no-usable-origin" };
  }

  const head = facts.defaultBranchCommit;
  const defaultBranch = facts.defaultBranch;
  if (!latest.known || head === null || defaultBranch === null) {
    return { ok: false, error: "no-answer" };
  }

  const { tags, tag: released } = latest;
  const delta = await readReleaseDelta(git, root, released, head);
  const rootFiles = await git.readRootFiles(root, head);
  return {
    ok: true,
    readiness: {
      released,
      tags,
      head,
      defaultBranch,
      content:
        delta === null || rootFiles === null
          ? null
          : { delta, blocked: blockedBy(delta, rootFiles) },
    },
  };
};

const blockedBy = (
  delta: ReleaseDelta,
  rootFiles: string[],
): ReleaseBlock | null => {
  if (rootFiles.includes("SKILL.md")) {
    return "root-skill-file";
  }
  return delta.movements.length === 0 ? "empty-delta" : null;
};
