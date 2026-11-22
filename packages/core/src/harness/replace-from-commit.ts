import { join } from "node:path";
import type { CopyTreeFsPort } from "../filesystem/copy-tree-fs";
import type { FileSystemPort } from "../registry/file-system";
import { type PrimitiveRef, primitiveEntry } from "./harness-primitive";
import {
  ensureHarnessPrimitiveDir,
  inspectPrimitiveEntry,
  type PrimitiveEntry,
  type PrimitiveEntryFs,
} from "./harness-primitive-dir";
import type { HarnessGitPort } from "./read-harness-state";

export type ReplaceDeps = {
  fs: PrimitiveEntryFs & Pick<FileSystemPort, "ensureDir">;
  copyFs: Pick<CopyTreeFsPort, "createStagingDir" | "movePath" | "removePath">;
  git: Pick<HarnessGitPort, "writePrimitiveInto">;
};

export type ReplaceOutcome =
  | "replaced"
  | "destination-unsafe"
  | "destination-unreadable"
  | "failed";

type Item = {
  ref: PrimitiveRef;
  entry: Extract<PrimitiveEntry, { kind: "plain" | "absent" }>;
  held: boolean;
};

export async function replaceFromCommit(
  deps: ReplaceDeps,
  {
    root,
    commit,
    atCommit,
    refs,
  }: {
    root: string;
    commit: string;
    atCommit: readonly PrimitiveRef[];
    refs: readonly PrimitiveRef[];
  },
): Promise<ReplaceOutcome> {
  const located = await locate(deps, root, atCommit, refs);
  if (!Array.isArray(located)) {
    return located;
  }
  const items = located.filter(
    (item) => item.held || item.entry.kind === "plain",
  );
  const staged: { item: Item; staging: string }[] = [];
  try {
    for (const item of items) {
      const staging = await deps.copyFs.createStagingDir(item.entry.dir);
      staged.push({ item, staging });
      if (item.held) {
        const written = await deps.git.writePrimitiveInto(
          root,
          item.ref,
          commit,
          staging,
        );
        if (written !== "written") {
          return "failed";
        }
      }
    }
    return (await swapIn(deps, staged)) ? "replaced" : "failed";
  } catch {
    return "failed";
  } finally {
    for (const { staging } of staged) {
      await deps.copyFs.removePath(staging).catch(() => {});
    }
  }
}

async function locate(
  deps: ReplaceDeps,
  root: string,
  atCommit: readonly PrimitiveRef[],
  refs: readonly PrimitiveRef[],
): Promise<Item[] | Exclude<ReplaceOutcome, "replaced" | "failed">> {
  const found = await Promise.all(
    refs.map(async (ref) => ({
      ref,
      held: atCommit.some(
        (each) => each.type === ref.type && each.name === ref.name,
      ),
      entry: await inspectPrimitiveEntry(deps.fs, root, ref),
    })),
  );
  if (found.some(({ entry }) => entry.kind === "unsafe")) {
    return "destination-unsafe";
  }
  const items: Item[] = [];
  for (const { ref, held, entry: first } of found) {
    let entry = first;
    if (entry.kind === "unreadable" && held) {
      const made = await ensureHarnessPrimitiveDir(deps.fs, root, ref.type);
      if (!made.ok) {
        return made.reason === "outside-root"
          ? "destination-unsafe"
          : "destination-unreadable";
      }
      entry = await inspectPrimitiveEntry(deps.fs, root, ref);
    }
    if (entry.kind === "unsafe") {
      return "destination-unsafe";
    }
    if (entry.kind === "unreadable") {
      return "destination-unreadable";
    }
    items.push({ ref, held, entry });
  }
  return items;
}

async function swapIn(
  deps: ReplaceDeps,
  staged: readonly { item: Item; staging: string }[],
): Promise<boolean> {
  const done: [string, string][] = [];
  const move = async (from: string, to: string) => {
    await deps.copyFs.movePath(from, to);
    done.push([from, to]);
  };
  try {
    for (const { item, staging } of staged) {
      if (item.entry.kind === "plain") {
        await move(item.entry.path, join(staging, "discarded"));
      }
      if (item.held) {
        await move(join(staging, primitiveEntry(item.ref)), item.entry.path);
      }
    }
    return true;
  } catch {
    for (const [from, to] of done.reverse()) {
      await deps.copyFs.movePath(to, from).catch(() => {});
    }
    return false;
  }
}
