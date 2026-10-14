// Content at a commit never changes, so it is remembered for the life of the
// process, keyed by commit. A ref can move, so it resolves on every call.
import { readBlobs } from "../git/cat-file-batch";
import { runGitText } from "../git/run-git-text";
import {
  HARNESS_SKILLS_DIR,
  harnessSkillSubpath,
} from "../inventory/harness-layout";
import type { HarnessSkillTree } from "./skill-movements";

export class ReleasedContentReader {
  private readonly trees = new Map<
    string,
    Promise<HarnessSkillTree[] | null>
  >();
  private readonly manifests = new Map<string, string | null>();

  // Null on a ref the clone cannot resolve or a listing this parser does not
  // recognise; an empty array is a release without a skills directory.
  async skillTrees(
    root: string,
    ref: string,
  ): Promise<HarnessSkillTree[] | null> {
    const commit = await resolveCommit(root, ref);
    if (commit === null) {
      return null;
    }
    const known = this.trees.get(commit);
    if (known !== undefined) {
      return known;
    }
    const read = readTreesAt(root, commit);
    this.trees.set(commit, read);
    const trees = await read;
    // Only a full answer is remembered; a failure is asked again next time.
    if (trees === null || trees.length === 0) {
      this.trees.delete(commit);
    }
    return trees;
  }

  // Null for a name whose SKILL.md is missing at `ref`, or for every name
  // when `ref` does not resolve.
  async skillManifests(
    root: string,
    ref: string,
    names: readonly string[],
  ): Promise<Record<string, string | null>> {
    const commit = await resolveCommit(root, ref);
    if (commit === null) {
      return Object.fromEntries(names.map((name) => [name, null]));
    }
    const key = (name: string) => `${commit}\0${name}`;
    const unread = [...new Set(names)].filter(
      (name) => !this.manifests.has(key(name)),
    );
    if (unread.length > 0) {
      const blobs = await readBlobs(
        root,
        unread.map((name) => `${commit}:${harnessSkillSubpath(name)}/SKILL.md`),
      ).catch(() => null);
      if (blobs === null) {
        return Object.fromEntries(names.map((name) => [name, null]));
      }
      unread.forEach((name, index) => {
        this.manifests.set(key(name), blobs[index]?.toString("utf8") ?? null);
      });
    }
    return Object.fromEntries(
      names.map((name) => [name, this.manifests.get(key(name)) ?? null]),
    );
  }
}

const resolveCommit = (root: string, ref: string): Promise<string | null> =>
  runGitText(root, ["rev-parse", "--verify", "--quiet", `${ref}^{commit}`]);

const readTreesAt = async (
  root: string,
  commit: string,
): Promise<HarnessSkillTree[] | null> => {
  // `-z`: otherwise git quotes any non-ASCII name. The commit resolved, so a
  // failed listing is a release without a skills directory.
  const listing = await runGitText(root, [
    "ls-tree",
    "-z",
    `${commit}:${HARNESS_SKILLS_DIR}`,
  ]);
  return listing === null ? [] : parseSkillTreeListing(listing);
};

// Null on a listing this parser does not recognise: skipping a line would
// read as a removal nobody made.
export const parseSkillTreeListing = (
  listing: string,
): HarnessSkillTree[] | null => {
  const skills: HarnessSkillTree[] = [];
  for (const entry of listing.split("\0")) {
    if (entry === "") {
      continue;
    }
    const [meta = "", name = ""] = entry.split("\t");
    const [mode, type, treeHash] = meta.split(" ");
    if (!mode || !type || !treeHash || !name) {
      return null;
    }
    if (type === "tree") {
      skills.push({ name, treeHash });
    }
  }
  return skills;
};
