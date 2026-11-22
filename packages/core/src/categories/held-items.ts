import { join } from "node:path";
import {
  type HarnessObject,
  type PrimitiveRef,
  primitiveDir,
  primitiveKey,
} from "../harness/harness-primitive";
import {
  inspectPrimitiveEntry,
  type PrimitiveEntryFs,
} from "../harness/harness-primitive-dir";
import type { HarnessTag } from "../harness/read-harness-state";
import { highestReleaseTag } from "../harness/release-tag";

export type HeldItems = { holds: (ref: PrimitiveRef) => boolean };

export type ReadHeldItems = (
  root: string,
  refs: readonly PrimitiveRef[],
) => Promise<HeldItems | null>;

type HeldItemsGitPort = {
  readTags(root: string): Promise<HarnessTag[] | null>;
  readPrimitivesAtTag(
    root: string,
    tag: string,
  ): Promise<HarnessObject[] | null>;
};

const releasedKeys = async (
  git: HeldItemsGitPort,
  root: string,
): Promise<Set<string> | null> => {
  const tags = await git.readTags(root);
  if (tags === null) return null;
  const tag = highestReleaseTag(tags);
  if (tag === null) return new Set();
  const objects = await git.readPrimitivesAtTag(root, tag.name);
  return objects === null ? null : new Set(objects.map(primitiveKey));
};

const onDisk = async (
  fs: PrimitiveEntryFs,
  root: string,
  ref: PrimitiveRef,
): Promise<boolean | null> => {
  if (!(await fs.exists(join(root, primitiveDir(ref.type))))) return false;
  const entry = await inspectPrimitiveEntry(fs, root, ref);
  return entry.kind === "unreadable" ? null : entry.kind === "plain";
};

export const heldBeside = async (
  fs: PrimitiveEntryFs,
  root: string,
  refs: readonly PrimitiveRef[],
  known: ReadonlySet<string>,
): Promise<HeldItems | null> => {
  try {
    const held = new Set<string>();
    for (const ref of refs) {
      const key = primitiveKey(ref);
      if (known.has(key) || held.has(key)) {
        held.add(key);
        continue;
      }
      const found = await onDisk(fs, root, ref);
      if (found === null) return null;
      if (found) held.add(key);
    }
    const asked = new Set(refs.map(primitiveKey));
    // Unknown is not absent: an entry saved after the read is kept.
    return {
      holds: (ref) =>
        !asked.has(primitiveKey(ref)) || held.has(primitiveKey(ref)),
    };
  } catch {
    return null;
  }
};

export const heldItemsFrom =
  (deps: { git: HeldItemsGitPort; fs: PrimitiveEntryFs }): ReadHeldItems =>
  async (root, refs) => {
    const released = await releasedKeys(deps.git, root).catch(() => null);
    return released === null
      ? null
      : await heldBeside(deps.fs, root, refs, released);
  };
