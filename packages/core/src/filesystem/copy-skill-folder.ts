// One skill folder copied whole or not at all: judged before written, staged,
// and exposed as one rename (#573).
import { join, relative, sep } from "node:path";
import { isWithinRoot } from "./browse-path";
import type { CopyEntryFacts, CopyTreeFsPort } from "./copy-tree-fs";

const MAX_FILES = 1000;
const MAX_BYTES = 50 * 1024 * 1024;

// Skipped at any depth, so a cloned skill repository copies without its
// repository internals — and without counting toward the limits.
const SKIPPED_ENTRY = ".git";

export type CopySkillFolderError =
  | "invalid-name"
  | "not-found"
  | "not-a-directory"
  | "destination-exists"
  // Escaping, dangling and looping links are one class on purpose: naming which
  // one would answer a question about a path the caller may not read.
  | "unsafe-link"
  | "hard-linked-file"
  | "special-file"
  | "too-many-files"
  | "too-large"
  | "source-changed"
  // The filesystem refused a read or a write. Never carries its reason.
  | "copy-failed";

export type CopySkillFolderResult =
  | { ok: true; path: string }
  | { ok: false; error: CopySkillFolderError };

export type CopySkillFolderInput = {
  source: string;
  destinationParent: string;
  name: string;
};

// `link` is the symbolic link this file was reached through, whose containment
// is proved again immediately before the read. Null for a file found directly.
type PlannedFile = {
  relPath: string;
  readPath: string;
  link: string | null;
  facts: CopyEntryFacts;
};

type Plan = { dirs: string[]; files: PlannedFile[]; bytes: number };

// What every step of the walk needs and nothing that changes between steps:
// the canonical source root the containment checks answer to, and the plan
// being built.
type Walk = { root: string; plan: Plan };

export class CopySkillFolder {
  private readonly fs: CopyTreeFsPort;

  constructor(deps: { fs: CopyTreeFsPort }) {
    this.fs = deps.fs;
  }

  async copy(input: CopySkillFolderInput): Promise<CopySkillFolderResult> {
    if (!isSingleSegment(input.name)) {
      return { ok: false, error: "invalid-name" };
    }
    const destination = join(input.destinationParent, input.name);

    // Canonical from here on: the containment checks compare resolved paths,
    // and a symlinked prefix (macOS /var -> /private/var) would fail every one
    // of them against a raw root.
    const root = await this.fs.realpath(input.source);
    if (root === null) {
      return { ok: false, error: "not-found" };
    }
    const rootFacts = await this.fs.describe(root);
    if (rootFacts === null) {
      return { ok: false, error: "not-found" };
    }
    if (rootFacts.kind !== "directory") {
      return { ok: false, error: "not-a-directory" };
    }
    if ((await this.fs.describe(destination)) !== null) {
      return { ok: false, error: "destination-exists" };
    }

    const plan: Plan = { dirs: [], files: [], bytes: 0 };
    const refusal = await this.planDirectory(
      { root, plan },
      root,
      "",
      new Set([root]),
    );
    if (refusal !== null) {
      return { ok: false, error: refusal };
    }

    return this.materialize(input.destinationParent, destination, root, plan);
  }

  // Walks one directory and everything under it, deciding but never writing.
  // Returns the refusal that stops the whole operation, or null.
  private async planDirectory(
    walk: Walk,
    dir: string,
    relDir: string,
    ancestors: Set<string>,
  ): Promise<CopySkillFolderError | null> {
    const names = await this.fs.listNames(dir);
    if (names === null) {
      return "copy-failed";
    }
    for (const name of names) {
      if (name === SKIPPED_ENTRY) {
        continue;
      }
      const refusal = await this.planEntry(
        walk,
        join(dir, name),
        relDir === "" ? name : join(relDir, name),
        ancestors,
      );
      if (refusal !== null) {
        return refusal;
      }
    }
    return null;
  }

  private async planEntry(
    walk: Walk,
    path: string,
    relPath: string,
    ancestors: Set<string>,
  ): Promise<CopySkillFolderError | null> {
    const facts = await this.fs.describe(path);
    if (facts === null) {
      return "source-changed";
    }
    if (facts.kind === "symlink") {
      return this.planLink(walk, path, relPath, ancestors);
    }
    if (facts.kind === "directory") {
      return this.planSubtree(walk, path, relPath, ancestors);
    }
    if (facts.kind === "file") {
      return planFile(walk.plan, {
        relPath,
        readPath: path,
        link: null,
        facts,
      });
    }
    return "special-file";
  }

  // A link is judged as whatever it points at, once that target is proved to be
  // inside the source root.
  private async planLink(
    walk: Walk,
    path: string,
    relPath: string,
    ancestors: Set<string>,
  ): Promise<CopySkillFolderError | null> {
    // Containment is proved on the resolved target before anything about that
    // target is read — including its type.
    const target = await this.fs.realpath(path);
    if (target === null || !isWithinRoot(target, walk.root)) {
      return "unsafe-link";
    }
    // The skip is about repository internals, not about the name of the entry
    // that leads to them: a link is judged by where it lands.
    if (isRepositoryInternal(walk.root, target)) {
      return null;
    }
    const facts = await this.fs.describe(target);
    if (facts === null) {
      return "source-changed";
    }
    if (facts.kind === "directory") {
      // A link back onto a directory the walk is already inside would recurse
      // forever; that is the loop the rule refuses.
      if (ancestors.has(target)) {
        return "unsafe-link";
      }
      return this.planSubtree(walk, target, relPath, ancestors);
    }
    if (facts.kind !== "file") {
      return "special-file";
    }
    return planFile(walk.plan, {
      relPath,
      readPath: target,
      link: path,
      facts,
    });
  }

  private async planSubtree(
    walk: Walk,
    dir: string,
    relPath: string,
    ancestors: Set<string>,
  ): Promise<CopySkillFolderError | null> {
    walk.plan.dirs.push(relPath);
    return this.planDirectory(walk, dir, relPath, new Set([...ancestors, dir]));
  }

  // Builds the whole copy inside a private staging directory and exposes it as
  // one rename. Every exit that is not that rename removes the staging tree, so
  // a refusal leaves the destination parent as it found it.
  private async materialize(
    destinationParent: string,
    destination: string,
    root: string,
    plan: Plan,
  ): Promise<CopySkillFolderResult> {
    let staging: string;
    try {
      staging = await this.fs.createStagingDir(destinationParent);
    } catch {
      return { ok: false, error: "copy-failed" };
    }
    // The payload is a plain directory inside the staging one: the staging
    // directory itself is created private, and those bits must not become the
    // skill folder's.
    const payload = join(staging, "payload");
    try {
      await this.fs.makeDir(payload);
      for (const dir of plan.dirs) {
        await this.fs.makeDir(join(payload, dir));
      }
      for (const file of plan.files) {
        const refusal = await this.verifyUnchanged(root, file);
        if (refusal !== null) {
          return { ok: false, error: refusal };
        }
        await this.fs.copyFile(
          file.readPath,
          join(payload, file.relPath),
          file.facts.executable,
        );
      }
      // Re-read at the point of use: the destination was free when the plan was
      // made, and this is the last moment before it is claimed.
      if ((await this.fs.describe(destination)) !== null) {
        return { ok: false, error: "destination-exists" };
      }
      await this.fs.movePath(payload, destination);
      return { ok: true, path: destination };
    } catch {
      return { ok: false, error: "copy-failed" };
    } finally {
      // After a successful move this removes an empty directory; after anything
      // else it removes the half-built copy.
      await this.fs.removePath(staging).catch(() => {});
    }
  }

  // Proves, immediately before the read, that the entry is still the one the
  // plan judged — and that a link still points where it pointed then.
  private async verifyUnchanged(
    root: string,
    file: PlannedFile,
  ): Promise<CopySkillFolderError | null> {
    if (file.link !== null) {
      const target = await this.fs.realpath(file.link);
      if (target === null || !isWithinRoot(target, root)) {
        return "unsafe-link";
      }
      if (target !== file.readPath) {
        return "source-changed";
      }
    }
    const now = await this.fs.describe(file.readPath);
    if (
      now === null ||
      now.kind !== "file" ||
      now.size !== file.facts.size ||
      now.identity !== file.facts.identity
    ) {
      return "source-changed";
    }
    return null;
  }
}

// True when a canonical path inside the source root sits in or under a `.git`
// directory at any depth. Both inputs are already realpath output.
function isRepositoryInternal(root: string, target: string): boolean {
  return relative(root, target).split(sep).includes(SKIPPED_ENTRY);
}

// A plain directory name and nothing else: anything that could climb out of the
// destination parent is refused before a path is built from it (security.md).
function isSingleSegment(name: string): boolean {
  return (
    name !== "" &&
    name !== "." &&
    name !== ".." &&
    !name.includes("/") &&
    !name.includes("\\") &&
    !name.includes("\0")
  );
}

// Adds one regular file to the plan, or returns the rule that refuses it. The
// limits count only what reaches here, which is what makes them "after .git
// exclusions".
function planFile(plan: Plan, file: PlannedFile): CopySkillFolderError | null {
  if (file.facts.hardLinks > 1) {
    return "hard-linked-file";
  }
  if (plan.files.length + 1 > MAX_FILES) {
    return "too-many-files";
  }
  const bytes = plan.bytes + file.facts.size;
  if (bytes > MAX_BYTES) {
    return "too-large";
  }
  plan.files.push(file);
  plan.bytes = bytes;
  return null;
}
