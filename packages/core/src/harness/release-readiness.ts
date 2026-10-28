// Every precondition of a release, read once at the commit it would tag. The
// release plan and the publication both read it, so they never disagree on
// whether a release can be published.
import { parseGitOrigin } from "../deploy/git-origin";
import type { LatestRelease } from "./latest-release";
import type {
  HarnessFacts,
  HarnessGitPort,
  HarnessTag,
} from "./read-harness-state";
import { type ReleaseDelta, readReleaseDelta } from "./release-delta";

// `root-skill-file`: a SKILL.md at the root makes apm deliver the whole
// Harness as one skill, which no target can then manage (#1587).
export type ReleaseBlock = "empty-delta" | "root-skill-file";

type ReleaseReadiness = {
  released: HarnessTag | null;
  tags: HarnessTag[];
  head: string;
  defaultBranch: string;
  // Null where the delta or the root could not be read: a commit nobody
  // could read is never ready.
  content: { delta: ReleaseDelta; blocked: ReleaseBlock | null } | null;
};

type ReleaseReadinessResult =
  | { ok: true; readiness: ReleaseReadiness }
  | { ok: false; error: "no-usable-origin" | "no-answer" };

// A release nobody can know is not a first release (#519).
export const readReleaseReadiness = async (
  git: Pick<HarnessGitPort, "readPrimitives" | "readAuthors" | "readRootFiles">,
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
