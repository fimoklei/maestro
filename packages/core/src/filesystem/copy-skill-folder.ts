// One skill folder copied whole or not at all: judged before written, staged,
// and exposed as one rename (#573).
import { join, relative, sep } from "node:path";
import type { CopyEntryFacts, CopyTreeFsPort } from "./copy-tree-fs";
import { isOperatingSystemFile } from "./operating-system-files";
import { isWithinRoot } from "./path-containment";

const MAX_FILES = 1000;
const MAX_BYTES = 50 * 1024 * 1024;

// Skipped at any depth and not counted toward the limits. `same-tree.ts` must
// skip the same entries.
export function isSkippedEntry(name: string): boolean {
  return name === ".git" || isOperatingSystemFile(name);
}

export type CopySkillFolderError =
  | "invalid-name"
  | "not-found"
  | "not-a-directory"
  | "destination-exists"
  // One class on purpose: naming which kind would reveal an unreadable path.
  | "unsafe-link"
  | "hard-linked-file"
  | "special-file"
  | "too-many-files"
  | "too-large"
  | "source-changed"
  // Never carries the filesystem's reason.
  | "copy-failed";

export type CopySkillFolderResult =
  | { ok: true; path: string; skipped: number }
  | { ok: false; error: CopySkillFolderError };

export type CopySkillFolderInput = {
  source: string;
  destinationParent: string;
  name: string;
  // Never inferred: without it an existing destination is refused (#731).
  replaceExisting?: boolean;
  // Runs on the staged copy, before the publishing rename. False refuses the
  // whole operation (#576).
  finalize?: (payload: string) => Promise<boolean>;
};

// `link` is the symlink the file was reached through; its containment is
// proved again right before the read.
type PlannedFile = {
  relPath: string;
  readPath: string;
  link: string | null;
  facts: CopyEntryFacts;
};

// The identity catches a directory swapped after the walk.
type PlannedDir = { relPath: string; readPath: string; identity: string };

type Plan = {
  dirs: PlannedDir[];
  files: PlannedFile[];
  bytes: number;
  skipped: number;
};

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

    // Canonical: containment checks compare resolved paths, and a symlinked
    // prefix (macOS /var) would fail them all against a raw root.
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
    if (
      input.replaceExisting !== true &&
      (await this.fs.describe(destination)) !== null
    ) {
      return { ok: false, error: "destination-exists" };
    }

    const plan: Plan = { dirs: [], files: [], bytes: 0, skipped: 0 };
    const refusal = await this.planDirectory(
      { root, plan },
      root,
      "",
      new Set([root]),
    );
    if (refusal !== null) {
      return { ok: false, error: refusal };
    }

    return this.materialize(input, destination, root, plan);
  }

  // Decides, never writes. Returns the refusal that stops everything, or null.
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
      if (isSkippedEntry(name)) {
        walk.plan.skipped += 1;
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

  private async planLink(
    walk: Walk,
    path: string,
    relPath: string,
    ancestors: Set<string>,
  ): Promise<CopySkillFolderError | null> {
    // Prove containment before reading anything about the target, even its type.
    const target = await this.fs.realpath(path);
    if (target === null || !isWithinRoot(target, walk.root)) {
      return "unsafe-link";
    }
    if (landsOnSkipped(walk.root, target)) {
      walk.plan.skipped += 1;
      return null;
    }
    const facts = await this.fs.describe(target);
    if (facts === null) {
      return "source-changed";
    }
    if (facts.kind === "directory") {
      // A link back onto an ancestor would recurse forever.
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
    const facts = await this.fs.describe(dir);
    if (facts === null || facts.kind !== "directory") {
      return "source-changed";
    }
    walk.plan.dirs.push({ relPath, readPath: dir, identity: facts.identity });
    return this.planDirectory(walk, dir, relPath, new Set([...ancestors, dir]));
  }

  // Every exit except the publishing rename removes the staging tree.
  private async materialize(
    input: CopySkillFolderInput,
    destination: string,
    root: string,
    plan: Plan,
  ): Promise<CopySkillFolderResult> {
    const { finalize } = input;
    let staging: string;
    try {
      staging = await this.fs.createStagingDir(input.destinationParent);
    } catch {
      return { ok: false, error: "copy-failed" };
    }
    // A plain subdirectory: the staging directory's private mode must not
    // become the skill folder's.
    const payload = join(staging, "payload");
    try {
      await this.fs.makeDir(payload);
      for (const dir of plan.dirs) {
        const now = await this.fs.describe(dir.readPath);
        if (
          now === null ||
          now.kind !== "directory" ||
          now.identity !== dir.identity
        ) {
          return { ok: false, error: "source-changed" };
        }
        await this.fs.makeDir(join(payload, dir.relPath));
      }
      for (const file of plan.files) {
        const refusal = await this.copyOne(root, payload, file);
        if (refusal !== null) {
          return { ok: false, error: refusal };
        }
      }
      if (finalize !== undefined && !(await finalize(payload))) {
        return { ok: false, error: "copy-failed" };
      }
      // Re-read at the point of use, the last moment before it is claimed.
      const existing = await this.fs.describe(destination);
      if (existing !== null && input.replaceExisting !== true) {
        return { ok: false, error: "destination-exists" };
      }
      await this.publish(
        payload,
        destination,
        existing === null ? null : join(staging, "replaced"),
      );
      return { ok: true, path: destination, skipped: plan.skipped };
    } catch {
      return { ok: false, error: "copy-failed" };
    } finally {
      await this.fs.removePath(staging).catch(() => {});
    }
  }

  // A replaced folder is moved aside first and moved back if the swap fails.
  private async publish(
    payload: string,
    destination: string,
    aside: string | null,
  ): Promise<void> {
    if (aside === null) {
      await this.fs.movePath(payload, destination);
      return;
    }
    await this.fs.movePath(destination, aside);
    try {
      await this.fs.movePath(payload, destination);
    } catch (error) {
      await this.fs.movePath(aside, destination);
      throw error;
    }
  }

  // Reads through an opened descriptor, so a name swapped after the check
  // cannot redirect the read.
  private async copyOne(
    root: string,
    payload: string,
    file: PlannedFile,
  ): Promise<CopySkillFolderError | null> {
    const refusal = await this.verifyUnchanged(root, file);
    if (refusal !== null) {
      return refusal;
    }
    const open = await this.fs.openFile(file.readPath);
    if (open === null) {
      return "source-changed";
    }
    try {
      const facts = await open.facts();
      if (
        facts === null ||
        facts.kind !== "file" ||
        facts.size !== file.facts.size ||
        facts.identity !== file.facts.identity
      ) {
        return "source-changed";
      }
      await this.fs.writeFile(
        join(payload, file.relPath),
        await open.read(),
        file.facts.executable,
      );
      return null;
    } finally {
      await open.close().catch(() => {});
    }
  }

  // Call right before the read: the entry, and where a link points, may have
  // changed since the plan judged them.
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

// Both inputs must already be realpath output.
function landsOnSkipped(root: string, target: string): boolean {
  return relative(root, target).split(sep).some(isSkippedEntry);
}

// Refuses anything that could climb out of the destination parent.
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
