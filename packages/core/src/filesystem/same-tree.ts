// Two folders compared the way a whole-folder replacement would land: the same
// names, kinds, bytes and executable bits, with the copy's own skip applied.
import { join } from "node:path";
import type { FileSystemPort, RawDirEntry } from "../registry/file-system";
import { isSkippedEntry } from "./copy-skill-folder";
import type { CopyTreeFsPort } from "./copy-tree-fs";

// Two ports, because no one port carries both file text and mode bits: the
// executable bit is a change git records, so the comparison has to see it.
export type SameTreeFs = Pick<FileSystemPort, "readFile" | "listRawEntries"> &
  Pick<CopyTreeFsPort, "describe">;

const NOTHING: ReadonlySet<string> = new Set();

// True where both folders hold the same names with the same contents. Anything
// that cannot be proved identical counts as a difference, so a caller refusing
// on "no change" never refuses a replacement that carries one. `exclude` names
// entries the caller compares itself, and applies at the top level only.
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

// Sorted, so the two sides are compared in one order whatever the filesystem
// hands back. Null where the directory cannot be read.
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

// The bytes and the one mode bit git tracks. A file either side cannot describe
// is a difference: an unprovable equality is never reported as one.
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
