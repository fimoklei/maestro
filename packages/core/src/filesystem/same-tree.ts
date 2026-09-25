import { join } from "node:path";
import type { FileSystemPort, RawDirEntry } from "../registry/file-system";
import { isSkippedEntry } from "./copy-skill-folder";
import type { CopyTreeFsPort } from "./copy-tree-fs";

// Needs the executable bit too: git records it as a change.
export type SameTreeFs = Pick<FileSystemPort, "readFile" | "listRawEntries"> &
  Pick<CopyTreeFsPort, "describe">;

const NOTHING: ReadonlySet<string> = new Set();

// Same names, kinds, bytes and executable bits, with the copy's skip applied.
// Anything not provably identical is a difference. `exclude` applies at the
// top level only.
export async function sameTree(
  fs: SameTreeFs,
  left: string,
  right: string,
  exclude: ReadonlySet<string> = NOTHING,
): Promise<boolean> {
  const [here, there] = await Promise.all([
    listing(fs, left, exclude),
    listing(fs, right, exclude),
  ]);
  if (here === null || there === null || here.length !== there.length) {
    return false;
  }
  for (const [index, entry] of here.entries()) {
    const twin = there[index];
    if (
      twin === undefined ||
      twin.name !== entry.name ||
      twin.isDirectory !== entry.isDirectory ||
      entry.isSymlink ||
      twin.isSymlink
    ) {
      return false;
    }
    const [inLeft, inRight] = [join(left, entry.name), join(right, entry.name)];
    const same = entry.isDirectory
      ? await sameTree(fs, inLeft, inRight)
      : await sameFile(fs, inLeft, inRight);
    if (!same) {
      return false;
    }
  }
  return true;
}

async function listing(
  fs: SameTreeFs,
  path: string,
  exclude: ReadonlySet<string>,
): Promise<RawDirEntry[] | null> {
  const entries = await fs.listRawEntries(path).catch(() => null);
  return entries === null
    ? null
    : entries
        .filter(
          (entry) => !isSkippedEntry(entry.name) && !exclude.has(entry.name),
        )
        .sort((one, other) => one.name.localeCompare(other.name));
}

async function sameFile(
  fs: SameTreeFs,
  left: string,
  right: string,
): Promise<boolean> {
  const [here, there] = await Promise.all([
    fs.describe(left),
    fs.describe(right),
  ]);
  if (
    here === null ||
    there === null ||
    here.kind !== "file" ||
    there.kind !== "file" ||
    here.executable !== there.executable
  ) {
    return false;
  }
  const [text, twin] = await Promise.all([
    fs.readFile(left).catch(() => null),
    fs.readFile(right).catch(() => null),
  ]);
  return text !== null && text === twin;
}
