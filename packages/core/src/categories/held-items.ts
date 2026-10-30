// Which items the Harness holds: the latest release's names, then the Working
// harness on disk, so an item imported but not yet released keeps its category.
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

/** Whether the Harness holds an item; one it was not asked about reads as held. */
export type HeldItems = { holds: (ref: PrimitiveRef) => boolean };

/** Null: the release or the disk could not be read, so nothing is known. */
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

// A type's folder that does not exist holds nothing; inspecting it would read
// as unreadable.
const onDisk = async (
  fs: PrimitiveEntryFs,
  root: string,
  ref: PrimitiveRef,
): Promise<boolean | null> => {
  if (!(await fs.exists(join(root, primitiveDir(ref.type))))) return false;
  const entry = await inspectPrimitiveEntry(fs, root, ref);
  return entry.kind === "unreadable" ? null : entry.kind === "plain";
};

export const heldItemsFrom =
  (deps: { git: HeldItemsGitPort; fs: PrimitiveEntryFs }): ReadHeldItems =>
  async (root, refs) => {
    try {
      const released = await releasedKeys(deps.git, root);
      if (released === null) return null;
      const held = new Set<string>();
      for (const ref of refs) {
        const key = primitiveKey(ref);
        if (released.has(key) || held.has(key)) {
          held.add(key);
          continue;
        }
        const found = await onDisk(deps.fs, root, ref);
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
