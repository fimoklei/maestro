// Content at a commit never changes, so it is remembered for the life of the
// process, keyed by commit. A ref can move, so it resolves on every call.
import { createHash } from "node:crypto";
import { readBlobs } from "../git/cat-file-batch";
import { runGitText } from "../git/run-git-text";
import {
  HARNESS_SKILLS_DIR,
  harnessSkillSubpath,
} from "../inventory/harness-layout";
import { ReuseGate } from "../reuse-gate";
import { type HarnessObject, primitivePath } from "./harness-primitive";
import { listPrimitivesAt } from "./harness-primitive-git";

export type HarnessSkillTree = { name: string; treeHash: string };

// shortcut: trees, manifests and files stay remembered per commit for the life
// of the process, with no bound; cap them (least recently used) once a server
// that reads many releases shows memory growth.
export class ReleasedContentReader {
  // Only a full answer is remembered; a failure is asked again next time.
  private readonly trees = new ReuseGate<HarnessSkillTree[] | null>({
    now: () => new Date(),
    keep: (trees) => trees !== null && trees.length > 0,
  });
  private readonly primitiveLists = new ReuseGate<HarnessObject[] | null>({
    now: () => new Date(),
    keep: (objects) => objects !== null && objects.length > 0,
  });
  private readonly manifests = new Map<string, string | null>();
  private readonly prompts = new Map<string, string | null>();
  private readonly files = new Map<string, Record<string, string>>();

  // Null on a ref the clone cannot resolve or a listing this parser does not
  // recognise; an empty array is a release without a skills directory.
  async skillTrees(
    root: string,
    ref: string,
  ): Promise<HarnessSkillTree[] | null> {
    const commit = await resolveCommit(root, ref);
    return commit === null
      ? null
      : this.trees.run(commit, Number.POSITIVE_INFINITY, () =>
          readTreesAt(root, commit),
        );
  }

  // Every type. Null on a ref the clone cannot resolve; a missing type folder
  // is none of that type.
  async primitives(root: string, ref: string): Promise<HarnessObject[] | null> {
    const commit = await resolveCommit(root, ref);
    return commit === null
      ? null
      : this.primitiveLists.run(commit, Number.POSITIVE_INFINITY, () =>
          listPrimitivesAt(root, commit),
        );
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

  // Each prompt file's text at `ref`, keyed by name; a name without a file
  // there is absent. Null when `ref` does not resolve or a file cannot be read.
  async promptTexts(
    root: string,
    ref: string,
    names: readonly string[],
  ): Promise<Record<string, string> | null> {
    const commit = await resolveCommit(root, ref);
    if (commit === null) {
      return null;
    }
    const key = (name: string) => `${commit}\0${name}`;
    const unread = [...new Set(names)].filter(
      (name) => !this.prompts.has(key(name)),
    );
    if (unread.length > 0) {
      const blobs = await readBlobs(
        root,
        unread.map(
          (name) => `${commit}:${primitivePath({ type: "prompt", name })}`,
        ),
      ).catch(() => null);
      if (blobs === null) {
        return null;
      }
      unread.forEach((name, index) => {
        this.prompts.set(key(name), blobs[index]?.toString("utf8") ?? null);
      });
    }
    const texts: Record<string, string> = {};
    for (const name of names) {
      const text = this.prompts.get(key(name));
      if (typeof text === "string") {
        texts[name] = text;
      }
    }
    return texts;
  }

  // Each file's bytes hashed the way apm records a deployed file, keyed
  // inside the skill folder. Empty for a skill the release lacks; null when
  // `ref` does not resolve or a file cannot be read.
  async skillFiles(
    root: string,
    ref: string,
    name: string,
  ): Promise<Record<string, string> | null> {
    const commit = await resolveCommit(root, ref);
    if (commit === null) {
      return null;
    }
    const key = `${commit}\0${name}`;
    const known = this.files.get(key);
    if (known !== undefined) {
      return known;
    }
    const files = await readFilesAt(root, commit, name).catch(() => null);
    if (files !== null) {
      this.files.set(key, files);
    }
    return files;
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

const readFilesAt = async (
  root: string,
  commit: string,
  name: string,
): Promise<Record<string, string> | null> => {
  const subtree = harnessSkillSubpath(name);
  // -z, so a path holding a quote or a newline survives the split. The
  // commit resolved, so a failed listing is a skill the release lacks.
  const listing = await runGitText(root, [
    "ls-tree",
    "-r",
    "-z",
    "--name-only",
    commit,
    "--",
    subtree,
  ]);
  const paths = (listing ?? "").split("\0").filter((path) => path !== "");
  const blobs = await readBlobs(
    root,
    paths.map((path) => `${commit}:${path}`),
  );
  const files: Record<string, string> = {};
  for (const [index, path] of paths.entries()) {
    const bytes = blobs[index];
    // A file the batch cannot answer leaves no proof of the release's content.
    if (bytes === null || bytes === undefined) {
      return null;
    }
    files[path.slice(subtree.length + 1)] =
      `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  }
  return files;
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
