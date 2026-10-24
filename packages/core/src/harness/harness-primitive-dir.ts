import { join } from "node:path";
import { isWithinRoot } from "../filesystem/path-containment";
import type { FileSystemPort } from "../registry/file-system";
import {
  type HarnessPrimitiveType,
  type PrimitiveRef,
  primitiveDir,
  primitiveEntry,
} from "./harness-primitive";

export type ResolvedPrimitiveDir =
  | { ok: true; dir: string }
  | { ok: false; reason: "unreadable" | "outside-root" };

// The type's folder, resolved inside the Harness root. Never creates the
// folder: a caller that writes into it uses `ensureHarnessPrimitiveDir`.
async function resolveHarnessPrimitiveDir(
  fs: Pick<FileSystemPort, "realpath">,
  root: string,
  type: HarnessPrimitiveType,
): Promise<ResolvedPrimitiveDir> {
  let realRoot: string;
  let dir: string;
  try {
    realRoot = await fs.realpath(root);
    dir = await fs.realpath(join(root, primitiveDir(type)));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return isWithinRoot(dir, realRoot)
    ? { ok: true, dir }
    : { ok: false, reason: "outside-root" };
}

export type PrimitiveEntry =
  | { kind: "plain" | "absent"; dir: string; path: string }
  | { kind: "unsafe" }
  | { kind: "unreadable" };

/** Where a primitive sits on disk; any link, even one inside its folder, is unsafe. */
export async function inspectPrimitiveEntry(
  fs: Pick<
    FileSystemPort,
    "realpath" | "exists" | "isFileEntry" | "isDirectoryEntry"
  >,
  root: string,
  ref: PrimitiveRef,
): Promise<PrimitiveEntry> {
  const resolved = await resolveHarnessPrimitiveDir(fs, root, ref.type);
  if (!resolved.ok) {
    return { kind: resolved.reason === "unreadable" ? "unreadable" : "unsafe" };
  }
  const { dir } = resolved;
  const path = join(dir, primitiveEntry(ref));
  if (!(await fs.exists(path))) {
    return { kind: "absent", dir, path };
  }
  // Neither a folder nor a file without following it: a link.
  const plain =
    (await fs.isDirectoryEntry(path)) || (await fs.isFileEntry(path));
  return plain ? { kind: "plain", dir, path } : { kind: "unsafe" };
}

// The type's folder, created when missing. Each part of its path that exists
// is checked first, so a link leaving the Harness refuses before any write.
export async function ensureHarnessPrimitiveDir(
  fs: Pick<FileSystemPort, "realpath" | "ensureDir">,
  root: string,
  type: HarnessPrimitiveType,
): Promise<ResolvedPrimitiveDir> {
  let realRoot: string;
  try {
    realRoot = await fs.realpath(root);
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  let path = root;
  for (const part of primitiveDir(type).split("/")) {
    path = join(path, part);
    const real = await fs.realpath(path).catch(() => null);
    // Nothing exists below a missing part.
    if (real === null) break;
    if (!isWithinRoot(real, realRoot)) {
      return { ok: false, reason: "outside-root" };
    }
  }
  try {
    await fs.ensureDir(join(root, primitiveDir(type)));
  } catch {
    return { ok: false, reason: "unreadable" };
  }
  return resolveHarnessPrimitiveDir(fs, root, type);
}
